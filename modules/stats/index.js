
"use strict";
const fetch=require("node-fetch"),
    schedule=require("node-schedule");
function sleep(ms){return new Promise(resolve=>setTimeout(()=>resolve(),ms));};
module.exports=async(svr)=>{
const {db,pr,bot,setting}=svr.locals;
var stats={},fails={},highcpu={},highDown={},updating=new Set(),noticed={};
function getStats(isAdmin=false){
    let Stats={};
    for(let {sid,status} of db.servers.all())if(status==1||(status==2&&isAdmin)){
        if(stats[sid])Stats[sid]=stats[sid];
    }
    return Stats;
}
svr.get("/",(req,res)=>{
    let {theme=db.setting.get("theme")||"card"}=req.query;
    res.render(`stats/${theme}`,{
        stats:getStats(req.admin),
        admin:req.admin
    });
});
svr.ws("/stats/data",(ws,req)=>{
    ws.send(JSON.stringify(getStats(req.admin)));
    let timer = setInterval(()=>{
        ws.send(JSON.stringify(getStats(req.admin)));
    }, db.setting.get("interval")||1000);
    ws.on('close',()=>{
        clearInterval(timer);
        timer = undefined;
    });
})
svr.get("/stats/:sid",(req,res)=>{
    let {sid}=req.params,node=stats[sid];
    if (!req.admin){
        node.stat.net.devices = {};
    }
    res.render('stat',{
        sid,node,
        traffic:db.traffic.get(sid),
        load_m:db.load_m.select(sid),
        load_h:db.load_h.select(sid),
        admin:req.admin
    });
});
svr.ws("/stats/:sid/data",(ws,req)=>{
    let {sid}=req.params;
    let stat = stats[sid];
    if (!req.admin) {
        stat.stat.net.devices = {};
    }
    ws.send(JSON.stringify({sid,stat}));
    let timer = setInterval(()=>{
        stat = stats[sid];
        if (!req.admin) {
            stat.stat.net.devices = {};
        }
        ws.send(JSON.stringify({sid,...stat}));
    }, db.setting.get("interval")||1000);
    ws.on('close',()=>{
        clearInterval(timer);
        timer = undefined;
    });
})

svr.post("/stats/update",(req,res)=>{
    let {sid,data}=req.body;
    stats[sid]=data;
    res.json(pr(1,'update success'));
});

function update(server, stat){
    let {sid}=server;
    if(server.status<=0){
        delete stats[sid];
        return;
    }
    // let stat=await getStat(server);
    if(stat){
        let notice=false;
        if(stats[sid]&&stats[sid].stat==false)notice=true;
        if(server.data.device){
            let device=stat.net.devices[server.data.device];
            if(device){
                stat.net.total=device.total;
                stat.net.delta=device.delta;
            }
        }
        stats[sid]={name:server.name,stat},fails[sid]=0;
        if(notice){
            // console.log(`#恢复 ${server.name} ${new Date().toLocaleString()}`);
            bot.funcs.notice(`#恢复 ${server.name} ${new Date().toLocaleString()}`);
        }
        // if(stat.net.delta&&stat.net.delta.in>stat.net.delta.out*5&&stat.net.delta.in>15*1024*1024){
        //     if(highDown[sid]){
        //         bot.funcs.notice(`#下行异常 ${server.name} ↓:${strB(stat.net.delta.in)}/s ↑:${strB(stat.net.delta.out)}/s ${new Date().toLocaleString()}`);
        //     }
        //     else highDown[sid]=true;
        // } else highDown[sid]=false;
        // if(stat.cpu.multi>0.8){
        //     if((highcpu[sid]=(highcpu[sid]||0)+1)>=5){
        //         if(!noticed[sid]||new Date()-noticed[sid]>30*60*1000){
        //             bot.funcs.notice(`#过载 ${server.name} 持续5次探测CPU超过80% ${new Date().toLocaleString()}`);
        //             noticed[sid]=new Date();
        //         }
        //     }
        // } else if(stat.cpu.multi<0.5)highcpu[sid]=0;
    } else {
        let notice=false;
        if((fails[sid]=(fails[sid]||0)+1)>10){
            if(stats[sid]&&stats[sid].stat)notice=true;
            stats[sid]={name:server.name,stat:false};
        }
        if(notice){
            // console.log(`#掉线 ${server.name} ${new Date().toLocaleString()}`);
            bot.funcs.notice(`#掉线 ${server.name} ${new Date().toLocaleString()}`);
        }
    }
}

svr.ws("/stats/agent", (ws, res) => {
    let key = res.headers.key;
    let sid = res.headers.sid;
    let ss = db.servers.get(sid);
    if (!ss||ss.data.api.key !== key) {
        ws.close(1000, "Closed");
        return
    }
    ws.on("message", async (msg) => {
        let stat = JSON.parse(msg);
        update(ss, stat);
    });
})

function calc(){
    for(let server of db.servers.all()){
        let {sid}=server,stat=stats[sid];
        if(!stat||!stat.stat||stat.stat==-1)continue;
        let ni=stat.stat.net.total.in,
            no=stat.stat.net.total.out,
            t=db.lt.get(sid)||db.lt.ins(sid);
        let ti=ni<t.traffic[0]?ni:ni-t.traffic[0],
            to=no<t.traffic[1]?no:no-t.traffic[1];
        db.lt.set(sid,[ni,no]);
        db.traffic.add(sid,[ti,to]);
    }
}

sleep(10000).then(calc);
setInterval(calc,30*1000);

schedule.scheduleJob({second:0},()=>{
    for(let {sid} of db.servers.all()){
        let cpu=-1,mem=-1,swap=-1,ibw=-1,obw=-1;
        let stat=stats[sid];
        if(stat&&stat.stat&&stat.stat!=-1){
            cpu=stat.stat.cpu.multi*100;
            mem=stat.stat.mem.virtual.usedPercent;
            swap=stat.stat.mem.swap.usedPercent;
            ibw=stat.stat.net.delta.in;
            obw=stat.stat.net.delta.out;
        }
        db.load_m.shift(sid,{cpu,mem,swap,ibw,obw});
    }
});
schedule.scheduleJob({minute:0,second:1},()=>{
    db.traffic.shift_hs();
    for(let {sid} of db.servers.all()){
        let Cpu=0,Mem=0,Swap=0,Ibw=0,Obw=0,tot=0;
        for(let {cpu,mem,swap,ibw,obw} of db.load_m.select(sid))if(cpu!=-1){
            ++tot;
            Cpu+=cpu,Mem+=mem,Swap+=swap,Ibw+=ibw,Obw+=obw;
        }
        if(tot==0)db.load_h.shift(sid,{cpu:-1,mem:-1,swap:-1,ibw:-1,obw:-1});
        else db.load_h.shift(sid,{cpu:Cpu/tot,mem:Mem/tot,swap:Swap/tot,ibw:Ibw/tot,obw:Obw/tot});
    }
});
schedule.scheduleJob({hour:4,minute:0,second:2},()=>{db.traffic.shift_ds();});
schedule.scheduleJob({date:1,hour:4,minute:0,second:3},()=>{db.traffic.shift_ms();});
schedule.scheduleJob({second:0},()=>{
    let notices = Array();
    for(let {sid} of db.servers.all()) {
        let stat = stats[sid];
        console.log(stat);
        if (stat == undefined) {
            continue
        }
        let timestamp = stat.timestamp;
        let temp = Math.floor(Date.now() / 1000) - timestamp;
        if (temp > 60) {
            stats[sid] = {name:stat.name,stat:false};
            notices.push(stat.name);
        }
    }
    if (setting.bot.webhook && notices.length > 0) {
        let msg = "服务器已掉线：\n";
        notices.forEach(item => {
            msg += `\t- ${item}\n`;
        });
        bot.funcs.notice(msg);
    }
});
}
