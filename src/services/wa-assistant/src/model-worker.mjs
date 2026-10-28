// Explicit library wiring only. The isolated server never imports this worker.
import {classifyWithApprovedModel} from './model-adapter.mjs';
export function createModelWorker(broker,options={}){
  if(typeof broker?.prepareOneWithModel!=='function')throw Error('durable_broker_required');
  const approvals={credentialApproved:options.credentialApproved===true,budgetApproved:options.budgetApproved===true};
  return {runOne:()=>broker.prepareOneWithModel(text=>classifyWithApprovedModel(text,{...options,...approvals}),approvals)};
}
