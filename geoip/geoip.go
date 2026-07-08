// This package utilizes the MaxMind GeoLite2 GeoIP database https://dev.maxmind.com/geoip/geoip2/geolite2/.
// You must provide your own copy of this database for it to work.
// Read more about how this works at http://owncast.online/docs/geoip

package geoip

import (
	"net"
	"os"
	"sync"
	"sync/atomic"

	"github.com/oschwald/geoip2-golang"
	log "github.com/sirupsen/logrus"
)

const defaultGeoIPDatabasePath = "data/GeoLite2-City.mmdb"

// geoIPDatabasePathEnv overrides where the GeoLite2 database is loaded from,
// so operators can keep an up-to-date copy outside the data directory.
const geoIPDatabasePathEnv = "OWNCAST_GEOIP_DATABASE_PATH"

func databasePath() string {
	if path := os.Getenv(geoIPDatabasePathEnv); path != "" {
		return path
	}
	return defaultGeoIPDatabasePath
}

// Client can look up geography information for IP addresses.
type Client struct {
	cache    sync.Map
	openOnce sync.Once
	db       *geoip2.Reader
	enabled  int32
}

// NewClient creates a new Client.
func NewClient() *Client {
	return &Client{
		enabled: 1, // Try to use GeoIP support by default.
	}
}

// GeoDetails stores details about a location.
type GeoDetails struct {
	CountryCode string `json:"countryCode"`
	RegionName  string `json:"regionName"`
	TimeZone    string `json:"timeZone"`
}

// ApplyCountryHint merges an edge-provided country code (e.g. Cloudflare's
// CF-IPCountry) into a database lookup result. The edge terminates the real
// client connection, so its country beats the local database; region and
// time zone details from the database are kept when they agree.
func ApplyCountryHint(details *GeoDetails, countryHint string) *GeoDetails {
	if countryHint == "" {
		return details
	}
	if details == nil {
		return &GeoDetails{
			CountryCode: countryHint,
			RegionName:  "Unknown",
			TimeZone:    "",
		}
	}
	if details.CountryCode != countryHint {
		// The database disagrees with the edge; the edge wins and the
		// region-level details are dropped as unreliable.
		return &GeoDetails{
			CountryCode: countryHint,
			RegionName:  "Unknown",
			TimeZone:    "",
		}
	}
	return details
}

// GetGeoFromIP returns geo details associated with an IP address if we
// have previously fetched it.
func (c *Client) GetGeoFromIP(ip string) *GeoDetails {
	if cachedGeoDetails, ok := c.cache.Load(ip); ok {
		return cachedGeoDetails.(*GeoDetails)
	}

	if ip == "::1" || ip == "127.0.0.1" {
		return &GeoDetails{
			CountryCode: "N/A",
			RegionName:  "Localhost",
			TimeZone:    "",
		}
	}

	return c.fetchGeoForIP(ip)
}

// database lazily opens the GeoIP database once and keeps it open. A
// replaced database file is picked up on the next server restart.
func (c *Client) database() *geoip2.Reader {
	c.openOnce.Do(func() {
		path := databasePath()
		db, err := geoip2.Open(path)
		if err != nil {
			log.Warnln("GeoIP database not found or cannot be opened:", path, err)
			log.Warnln("GeoIP support is disabled. visit https://owncast.online/docs/geoip to learn how to enable.")
			atomic.StoreInt32(&c.enabled, 0)
			return
		}
		c.db = db
	})
	return c.db
}

// fetchGeoForIP looks up geo details for an IP address in the local database.
func (c *Client) fetchGeoForIP(ip string) *GeoDetails {
	// If GeoIP has been disabled then don't try to access it.
	if atomic.LoadInt32(&c.enabled) == 0 {
		log.Debugln("GeoIP is disabled, skipping lookup for:", ip)
		return nil
	}

	db := c.database()
	if db == nil {
		return nil
	}

	var response *GeoDetails
	ipObject := net.ParseIP(ip)
	if ipObject == nil {
		log.Warnln("GeoIP: Failed to parse IP address:", ip)
		return nil
	}

	record, err := db.City(ipObject)
	if err != nil {
		log.Warnln("GeoIP lookup error for IP", ip, ":", err)
		c.cache.Store(ip, response)
		return response
	}

	// If no country is available then exit
	// If we believe this IP to be anonymous then no reason to report it
	if record.Country.IsoCode != "" && !record.Traits.IsAnonymousProxy {
		var regionName = "Unknown"
		if len(record.Subdivisions) > 0 {
			if region, ok := record.Subdivisions[0].Names["en"]; ok {
				regionName = region
			}
		}

		response = &GeoDetails{
			CountryCode: record.Country.IsoCode,
			RegionName:  regionName,
			TimeZone:    record.Location.TimeZone,
		}
		log.Debugln("GeoIP lookup success for IP", ip, ":", response.RegionName, response.CountryCode)
	} else {
		log.Debugln("GeoIP: No country data for IP:", ip, "IsoCode:", record.Country.IsoCode, "IsAnonymousProxy:", record.Traits.IsAnonymousProxy)
	}

	c.cache.Store(ip, response)

	return response
}
