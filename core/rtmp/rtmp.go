package rtmp

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"time"

	"github.com/nareix/joy5/format/flv"
	"github.com/nareix/joy5/format/flv/flvio"
	log "github.com/sirupsen/logrus"

	"github.com/aoiasakawa/aoitube/config"
	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/models"
	"github.com/nareix/joy5/format/rtmp"
)

// certReloader serves the RTMPS TLS certificate and transparently reloads it
// from disk when the file changes (e.g. after a Let's Encrypt renewal), so the
// server does not have to be restarted to pick up a renewed certificate.
type certReloader struct {
	certPath, keyPath string

	mu        sync.RWMutex
	cert      *tls.Certificate
	certMod   time.Time
	nextCheck time.Time
}

// load reads the certificate/key pair from disk and caches it.
func (r *certReloader) load() (*tls.Certificate, error) {
	cert, err := tls.LoadX509KeyPair(r.certPath, r.keyPath)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	r.cert = &cert
	if info, statErr := os.Stat(r.certPath); statErr == nil {
		r.certMod = info.ModTime()
	}
	r.nextCheck = time.Now().Add(60 * time.Second)
	r.mu.Unlock()

	return &cert, nil
}

// getCertificate is the tls.Config.GetCertificate callback. It re-stats the
// certificate file at most once per minute and reloads it if it changed,
// otherwise it always keeps serving the last good certificate.
func (r *certReloader) getCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	r.mu.RLock()
	cert := r.cert
	next := r.nextCheck
	certMod := r.certMod
	r.mu.RUnlock()

	if time.Now().Before(next) {
		return cert, nil
	}

	// Push the next check forward now to avoid a stat stampede under load.
	r.mu.Lock()
	r.nextCheck = time.Now().Add(60 * time.Second)
	r.mu.Unlock()

	info, err := os.Stat(r.certPath)
	if err != nil {
		return cert, nil // keep serving the last good cert
	}
	if info.ModTime().After(certMod) {
		if newCert, err := r.load(); err == nil {
			log.Infoln("Reloaded renewed RTMPS certificate")
			return newCert, nil
		} else {
			log.Errorf("Failed to reload RTMPS certificate, keeping previous: %v", err)
		}
	}
	return cert, nil
}

var _hasInboundRTMPConnection = false

var (
	_pipe           *io.PipeWriter
	_rtmpConnection net.Conn
)

var (
	_setStreamAsConnected func(*io.PipeReader)
	_setBroadcaster       func(models.Broadcaster)
)

// Start starts the rtmp service, listening on specified RTMP port.
func Start(setStreamAsConnected func(*io.PipeReader), setBroadcaster func(models.Broadcaster)) {
	_setStreamAsConnected = setStreamAsConnected
	_setBroadcaster = setBroadcaster

	// Start regular RTMP server
	go startRTMPServer()

	// Start RTMPS server if enabled
	if data.GetRTMPSEnabled() {
		go startRTMPSServer()
	}
}

func startRTMPServer() {
	port := data.GetRTMPPortNumber()
	s := rtmp.NewServer()
	var lis net.Listener
	var err error
	if lis, err = net.Listen("tcp", fmt.Sprintf(":%d", port)); err != nil {
		log.Fatal(err)
	}

	s.LogEvent = func(c *rtmp.Conn, nc net.Conn, e int) {
		es := rtmp.EventString[e]
		log.Traceln("RTMP", nc.LocalAddr(), nc.RemoteAddr(), es)
	}

	s.HandleConn = HandleConn

	log.Tracef("RTMP server is listening for incoming stream on port: %d", port)

	for {
		nc, err := lis.Accept()
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		go s.HandleNetConn(nc)
	}
}

func startRTMPSServer() {
	port := data.GetRTMPSPortNumber()
	certPath := data.GetRTMPSCertPath()
	keyPath := data.GetRTMPSKeyPath()

	if certPath == "" || keyPath == "" {
		log.Errorln("RTMPS is enabled but certificate or key path is not configured")
		return
	}

	reloader := &certReloader{certPath: certPath, keyPath: keyPath}
	// Load once at startup so a bad cert/key fails fast with a clear error.
	if _, err := reloader.load(); err != nil {
		log.Errorf("Failed to load TLS certificate for RTMPS: %v", err)
		return
	}

	tlsConfig := &tls.Config{
		GetCertificate: reloader.getCertificate,
		MinVersion:     tls.VersionTLS12,
	}

	s := rtmp.NewServer()

	lis, err := tls.Listen("tcp", fmt.Sprintf(":%d", port), tlsConfig)
	if err != nil {
		log.Errorf("Failed to start RTMPS server: %v", err)
		return
	}

	s.LogEvent = func(c *rtmp.Conn, nc net.Conn, e int) {
		es := rtmp.EventString[e]
		log.Traceln("RTMPS", nc.LocalAddr(), nc.RemoteAddr(), es)
	}

	s.HandleConn = HandleConn

	log.Infof("RTMPS server is listening for incoming stream on port: %d", port)

	for {
		nc, err := lis.Accept()
		if err != nil {
			log.Debugln("RTMPS accept error:", err)
			time.Sleep(time.Second)
			continue
		}
		go s.HandleNetConn(nc)
	}
}

// HandleConn is fired when an inbound RTMP connection takes place.
func HandleConn(c *rtmp.Conn, nc net.Conn) {
	c.LogTagEvent = func(isRead bool, t flvio.Tag) {
		if t.Type == flvio.TAG_AMF0 {
			log.Tracef("%+v\n", t.DebugFields())
			setCurrentBroadcasterInfo(t, nc.RemoteAddr().String())
		}
	}

	if _hasInboundRTMPConnection {
		log.Errorln("stream already running; can not overtake an existing stream from", nc.RemoteAddr().String())
		_ = nc.Close()
		return
	}

	accessGranted := false
	validStreamingKeys := data.GetStreamKeys()

	// If a stream key override was specified then use that instead.
	if config.TemporaryStreamKey != "" {
		validStreamingKeys = []models.StreamKey{{Key: config.TemporaryStreamKey}}
	}

	for _, key := range validStreamingKeys {
		if secretMatch(key.Key, c.URL.Path) {
			accessGranted = true
			break
		}
	}

	if !accessGranted {
		log.Errorln("invalid streaming key; rejecting incoming stream from", nc.RemoteAddr().String())
		_ = nc.Close()
		return
	}

	rtmpOut, rtmpIn := io.Pipe()
	_pipe = rtmpIn
	log.Infoln("Inbound stream connected from", nc.RemoteAddr().String())
	_setStreamAsConnected(rtmpOut)

	_hasInboundRTMPConnection = true
	_rtmpConnection = nc

	w := flv.NewMuxer(rtmpIn)

	for {
		if !_hasInboundRTMPConnection {
			break
		}

		// If we don't get a readable packet in 10 seconds give up and disconnect
		if err := _rtmpConnection.SetReadDeadline(time.Now().Add(10 * time.Second)); err != nil {
			log.Debugln(err)
		}

		pkt, err := c.ReadPacket()

		// Any read error ends the stream. Checking only for io.EOF and net
		// timeouts is not enough: abrupt disconnects surface as
		// io.ErrUnexpectedEOF, and RTMPS (TLS) teardowns produce their own
		// error types. Treating those as readable data used to leave the
		// connection flag set forever, rejecting all future streams with
		// "stream already running".
		if err != nil {
			if neterr, ok := err.(net.Error); ok && neterr.Timeout() {
				log.Debugln("Timeout reading the inbound stream from the broadcaster.  Assuming that they disconnected and ending the stream.")
			} else if err != io.EOF {
				log.Debugln("error reading inbound stream, ending the stream:", err)
			}
			handleDisconnect(nc)
			return
		}

		if err := w.WritePacket(pkt); err != nil {
			log.Errorln("unable to write rtmp packet", err)
			handleDisconnect(nc)
			return
		}
	}
}

func handleDisconnect(conn net.Conn) {
	if !_hasInboundRTMPConnection {
		return
	}

	log.Infoln("Inbound stream disconnected.")
	_ = conn.Close()
	_ = _pipe.Close()
	_hasInboundRTMPConnection = false
	_rtmpConnection = nil
}

// Disconnect will force disconnect the current inbound RTMP connection.
func Disconnect() {
	if _rtmpConnection == nil {
		return
	}

	log.Traceln("Inbound stream disconnect requested.")
	handleDisconnect(_rtmpConnection)
}
