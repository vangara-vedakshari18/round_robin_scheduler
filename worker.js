importScripts('engine.js');
self.onmessage=e=>{try{self.postMessage({model:simulate(e.data.jobs,e.data.options)});}catch(error){self.postMessage({error:error.message});}};
