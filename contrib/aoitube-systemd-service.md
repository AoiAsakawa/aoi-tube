This can be any text that makes sense to you.
```
[Unit]
Description=AoiTube Service
```

This is where the "functional" parts of the service live.<br />
```
[Service]
Type=simple
WorkingDirectory=[path_to_aoitube_root_directory]
ExecStart=[path_to_aoitube_executable]
Restart=on-failure
RestartSec=5
```
`WorkingDirectory` should be where you want the aoitube folder to live.<br />

**Example:**<br />
```WorkingDirectory=/var/www/aoitube```

Similarly the `ExecStart` is the actual aoitube binary.<br />

**Example:**<br />
```ExecStart=/var/www/aoitube/aoitube```

```
[Install]
WantedBy=multi-user.target
```
This just means, use runlevel 3 non-graphical.


**INSTALLATION**
Just create the file in your systemd configuraiton directory (typically /etc/systemd/system/), and update the systemd daemon with:
```$sudo systemd daemon-reload```

**USAGE**
Currently the following options work
- Start
- Stop
- Status
