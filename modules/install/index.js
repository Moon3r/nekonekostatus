"use strict";
module.exports=svr=> {
    const {db,setting,pr,parseNumber}=svr.locals;
    svr.get("/install/download/:filename", (req, res)=>{
        let {filename} = req.params;
        var path=__dirname+'/../../build/' + filename;
        res.download(path);
    });
    svr.get("/install/:sid", (req, res)=>{
        if (!req.admin){
            res.redirect("/login");
        }
        let {sid}=req.params;
        let server=db.servers.get(sid);
        let key=server.data.api.key;
        let setting=db.setting.all();
        let host=setting.site.host;
        let port=setting.listen;
        let interval=setting.interval;
        res.render("install/index",{
            data:{sid,key,host,port,interval}
        })
    });
    svr.get("/install/:sid/script", (req, res)=>{
        if (!req.admin) {
            res.redirect("/login");
        }
        let {sid} = req.params;
        let {key, fw} = req.query;
        let setting = db.setting.all();
        let downloadUrl = setting.neko_status_url + fw;
        let port = setting.listen;
        let host = setting.site.host;
        let interval = setting.interval;
        let scripts = `#!/bin/bash

wget --version||yum install wget -y||apt-get install wget -y
/usr/bin/neko-status -v||(wget ${downloadUrl} -O /usr/bin/neko-status && chmod +x /usr/bin/neko-status)
systemctl stop nekonekostatus
mkdir /etc/neko-status/
echo "key: ${key}
sid: ${sid}
port: ${port}
host: ${host}
interval: ${interval}
debug: false" > /etc/neko-status/config.yaml
systemctl stop nekonekostatus
echo "[Unit]
Description=nekonekostatus

[Service]
Restart=always
RestartSec=5
ExecStart=/usr/bin/neko-status -c /etc/neko-status/config.yaml

[Install]
WantedBy=multi-user.target" > /etc/systemd/system/nekonekostatus.service
systemctl daemon-reload
systemctl start nekonekostatus
systemctl enable nekonekostatus`;
        res.setHeader("Content-Disposition", "attachment; filename=install.sh");
        res.write(scripts);
        res.end();
    })
}
