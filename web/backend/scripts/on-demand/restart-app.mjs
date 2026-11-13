import{execFileSync}from'node:child_process';
import{applications}from'./units.mjs';
const[name]=process.argv.slice(2);
if(!applications[name])throw Error('unknown_backend_application');
const unit='backend-demand-'+name;
let activated=false;
try{execFileSync('systemctl',['--user','is-enabled',unit+'.socket'],{stdio:'ignore'});activated=true;}catch{/* Existing installations can still use PM2. */}
if(activated)execFileSync('systemctl',['--user','try-restart',unit+'.service'],{stdio:'inherit'});
else execFileSync('pm2',['restart',name,'--update-env'],{stdio:'inherit'});
