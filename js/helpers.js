/* ========================================================
   KasKelas v2.0 - Helper Utilities
   ======================================================== */

(function(window){
  'use strict';

  var $ = function(id){
    return document.getElementById(id);
  };

  var rp = function(n){
    return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
  };

  var esc = function(s){
    return String(s || '').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c];
    });
  };

  var uid = function(){
    return Math.random().toString(36).slice(2, 10);
  };

  function parseAmount(str){
    str = String(str || '').trim().toLowerCase().replace(/rp/g, '').replace(/\s+/g, '');
    if(!str) return null;
    var m = str.match(/^([\d.,]+)(k|rb|ribu)$/);
    if(m){
      var v = parseFloat(m[1].replace(',', '.'));
      return isNaN(v) ? null : Math.round(v * 1000);
    }
    if(/^[\d.,]+$/.test(str)){
      var n = parseInt(str.replace(/[.,]/g, ''), 10);
      return isNaN(n) ? null : n;
    }
    return null;
  }

  function getAvatarStyle(name){
    var colors = (window.AppConfig && window.AppConfig.AVATAR_COLORS) || [];
    var hash = 0;
    for(var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    var c = colors[Math.abs(hash) % colors.length] || {bg: '#e0e7ff', text: '#4338ca'};
    return 'background:' + c.bg + ';color:' + c.text + ';';
  }

  function getInitials(name){
    var p = String(name || '').trim().split(/\s+/);
    if(!p[0]) return '•';
    if(p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  function copyText(text, fallbackEl, onSuccess){
    var done = function(){ if(onSuccess) onSuccess(); };
    var fail = function(){
      if(fallbackEl){ fallbackEl.focus(); fallbackEl.select(); }
    };
    try {
      navigator.clipboard.writeText(text).then(done, fail);
    } catch(e){
      fail();
    }
  }

  function pwField(id, ph){
    var eyeOff = (window.AppConfig && window.AppConfig.ICONS && window.AppConfig.ICONS.eyeOff) || '';
    return '<div class="pw-wrap"><input id="'+id+'" type="password" placeholder="'+esc(ph)+'" autocomplete="new-password" spellcheck="false" autocapitalize="off"><button type="button" class="pw-eye" aria-label="Tampilkan password" aria-pressed="false">'+eyeOff+'</button></div>';
  }

  function bindPw(root){
    var icons = (window.AppConfig && window.AppConfig.ICONS) || {};
    root.querySelectorAll('.pw-wrap').forEach(function(w){
      var i = w.querySelector('input'), b = w.querySelector('.pw-eye');
      b.onclick = function(){
        var show = i.type === 'password';
        i.type = show ? 'text' : 'password';
        b.innerHTML = show ? icons.eye : icons.eyeOff;
        b.setAttribute('aria-pressed', show ? 'true' : 'false');
        i.focus();
      };
    });
  }

  window.AppHelpers = {
    $: $,
    rp: rp,
    esc: esc,
    uid: uid,
    parseAmount: parseAmount,
    getAvatarStyle: getAvatarStyle,
    getInitials: getInitials,
    copyText: copyText,
    pwField: pwField,
    bindPw: bindPw
  };
})(window);
