/* Neon API database adapter. Application data is remote; only the login token is kept in memory. */
(function(window){
  'use strict';

  var token = null, sessionRole = null;
  var listeners = [];
  var pollTimer = null;

  function apiBase(){
    var value = window.NeonConfig && window.NeonConfig.API_URL;
    if(!value || !/^https:\/\//i.test(value)) throw new Error('Neon API belum dikonfigurasi. Isi API_URL di js/neon-config.js setelah deploy fungsi Neon.');
    return value.replace(/\/$/, '');
  }
  function request(path, method, body){
    var headers = {'Accept':'application/json'};
    if(body !== undefined) headers['Content-Type'] = 'application/json';
    if(token) headers.Authorization = 'Bearer ' + token;
    return fetch(apiBase() + path, {method:method || 'GET', headers:headers, body:body === undefined ? undefined : JSON.stringify(body)})
      .then(function(res){ return res.text().then(function(raw){
        var data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch(e){}
        if(!res.ok){ var err = new Error(data.error || 'Permintaan ke Neon gagal ('+res.status+').'); err.code = data.code || res.status; throw err; }
        return data;
      }); });
  }
  function encodePath(path){ return '?path='+encodeURIComponent(path); }
  function collectionSnapshot(path){
    return request('/api/collection'+encodePath(path)).then(function(result){
      return {docs:(result.docs || []).map(function(x){ return {id:x.id, data:function(){ return x.data || {}; }}; })};
    });
  }
  function refreshListeners(){
    return Promise.all(listeners.slice().map(function(item){
      if(!item.active) return Promise.resolve();
      return collectionSnapshot(item.path).then(function(snap){
        var text = JSON.stringify(snap.docs.map(function(d){ return [d.id,d.data()]; }));
        if(text !== item.last){ item.last=text; item.callback(snap); }
      }).catch(function(e){ if(item.onError) item.onError(e); });
    }));
  }
  function startPolling(){ if(!pollTimer && listeners.length) pollTimer=setInterval(refreshListeners, 8000); }
  function stopPolling(){ if(!listeners.length && pollTimer){ clearInterval(pollTimer); pollTimer=null; } }
  function notifyListeners(){ refreshListeners(); }

  function doc(path){ return {
    id:path.slice(path.lastIndexOf('/')+1), path:path,
    get:function(){ return request('/api/document'+encodePath(path)).then(function(x){ return {exists:!!x.exists,data:function(){return x.data||{};}}; }); },
    set:function(value){ return request('/api/document','PUT',{path:path,data:value}).then(function(x){ notifyListeners(); return x; }); },
    update:function(value){ return request('/api/document','PATCH',{path:path,data:value}).then(function(x){ notifyListeners(); return x; }); },
    delete:function(){ return request('/api/document'+encodePath(path),'DELETE').then(function(x){ notifyListeners(); return x; }); }
  }; }
  function collection(path){ return {
    get:function(){ return collectionSnapshot(path); },
    doc:function(id){ return doc(path+'/'+(id || (window.AppHelpers ? window.AppHelpers.uid() : Math.random().toString(36).slice(2,10)))); },
    onSnapshot:function(callback,onError){
      var item={path:path,callback:callback,onError:onError||null,active:true,last:null};
      listeners.push(item); startPolling();
      collectionSnapshot(path).then(function(snap){ if(!item.active)return; item.last=JSON.stringify(snap.docs.map(function(d){return[d.id,d.data()];})); callback(snap); }).catch(function(e){if(item.active&&item.onError)item.onError(e);});
      return function(){ item.active=false; listeners=listeners.filter(function(x){return x!==item;}); stopPolling(); };
    }
  }; }
  function createNeonDB(){
    apiBase();
    return {
      doc:doc, collection:collection,
      auth:{
        ownerSetup:function(setupToken,password){ return request('/api/auth/owner/setup','POST',{setupToken:setupToken,password:password}).then(function(x){token=x.token;sessionRole=x.role;return x;}); },
        ownerLogin:function(password){ return request('/api/auth/owner/login','POST',{password:password}).then(function(x){token=x.token;sessionRole=x.role;return x;}); },
        adminLogin:function(classId,password){ return request('/api/auth/admin/login','POST',{classId:classId,password:password}).then(function(x){token=x.token;sessionRole=x.role;return x;}); },
        logout:function(){ var p=token ? request('/api/auth/logout','POST',{}) : Promise.resolve(); token=null;sessionRole=null;return p.catch(function(){}); },
        get role(){ return sessionRole || 'public'; }
      },
      migrateLegacy:function(){
        var legacy;
        try{ legacy=JSON.parse(localStorage.getItem('uang-kas-kelas-v1')||'{}'); }catch(e){return Promise.reject(new Error('Data browser lama tidak dapat dibaca.'));}
        return request('/api/migrations/local-storage','POST',{data:legacy}).then(function(r){ localStorage.removeItem('uang-kas-kelas-v1'); return r; });
      }
    };
  }

  function writeError(e,onToast){
    var msg=e && e.message || 'Gagal menyimpan perubahan ke Neon.';
    if(e && e.code===401) msg='Sesi tidak aktif. Masuk kembali sebagai Admin atau Owner.';
    else if(e && e.code===403) msg='Akses ditolak. Periksa hak akses akun ini.';
    if(onToast) onToast(msg);
  }
  function safe(fn,onToast){return Promise.resolve().then(fn).then(function(){return true;},function(e){writeError(e,onToast);return false;});}
  function batched(ops,n){n=n||6;var i=0;function next(){if(i>=ops.length)return Promise.resolve();var part=ops.slice(i,i+n);i+=n;return Promise.all(part.map(function(f){return f();})).then(next);}return next();}

  window.AppDB={createNeonDB:createNeonDB,writeError:writeError,safe:safe,batched:batched};
})(window);
