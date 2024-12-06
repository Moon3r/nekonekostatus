"use strict";
module.exports=svr=>{
const {db,setting,pr,parseNumber}=svr.locals;
svr.post("/admin/servers/add",async(req,res)=>{
    var {sid,name,data,top,status}=req.body;
    if(!sid)sid=uuid.v1();
    db.servers.ins(sid,name,data,top,status);
    res.json(pr(1,sid));
});
svr.get("/admin/servers/add",(req,res)=>{
    res.render(`admin/servers/add`,{});
});
svr.post("/admin/servers/:sid/edit",async(req,res)=>{
    var {sid}=req.params,{name,data,top,status}=req.body;
    db.servers.upd(sid,name,data,top);
    if(status!=null)db.servers.upd_status(sid,status);
    res.json(pr(1,'修改成功'));
});
svr.post("/admin/servers/:sid/del",async(req,res)=>{
    var {sid}=req.params;
    db.servers.del(sid);
    res.json(pr(1,'删除成功'));
});
svr.get("/admin/servers",(req,res)=>{
    res.render("admin/servers",{
        servers:db.servers.all()
    })
});
svr.post("/admin/servers/ord",(req,res)=>{
    var {servers}=req.body,ord=0;
    servers.reverse();
    for(var sid of servers)db.servers.upd_top(sid,++ord);
    res.json(pr(true,'更新成功'));
});
svr.get("/admin/servers/:sid",(req,res)=>{
    var {sid}=req.params,server=db.servers.get(sid);
    res.render(`admin/servers/edit`,{
        server,
    });
});
}