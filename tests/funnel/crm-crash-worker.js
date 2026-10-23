const {Store}=require('../../src/services/lifecycle/store');
const s=new Store(process.argv[2],{sandbox:true}),now='2026-10-20T09:00:00.000Z';
const p=s.claimProjection({workerId:'crashed-process',now,leaseMs:1000});
s.beginProjection({...p,binding:'owned',payloadHash:'a'.repeat(64),now});
process.exit(74); // Simulated loss after committing inflight, without close().
