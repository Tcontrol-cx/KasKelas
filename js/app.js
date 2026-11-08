/* ========================================================
   KasKelas v2.0 - Main Application Controller
   ======================================================== */

(function(){
  'use strict';

  var C = window.AppConfig;
  var H = window.AppHelpers;
  var DBUtils = window.AppDB;
  var Reports = window.AppReports;

  var $ = H.$;
  var rp = H.rp;
  var esc = H.esc;
  var uid = H.uid;
  var parseAmount = H.parseAmount;
  var copyText = H.copyText;
  var pwField = H.pwField;
  var bindPw = H.bindPw;
  var getAvatarStyle = H.getAvatarStyle;
  var getInitials = H.getInitials;

  /* ====== STATE APLIKASI ====== */
  var DB = null, DL = null;
  var IS_OWNER = false, CAN_WRITE = false;
  var classes = [], classesLoaded = false;
  var screen = 'home', homeTab = 'kelas';
  var cur = null; // kelas aktif
  var syncT = null, toastT = null;

  /* ====== THEME CONTROLLER ====== */
  function updateThemeIcon(){
    var theme = document.documentElement.getAttribute('data-theme') || 'light';
    var btn = $('btnTheme');
    if(btn) btn.innerHTML = theme === 'dark' ? C.ICONS.sun : C.ICONS.moon;
  }

  function initTheme(){
    var btn = $('btnTheme');
    var updateMetaTheme = function(t){
      var m = document.querySelector('meta[name="theme-color"]');
      if(m) m.setAttribute('content', t === 'dark' ? '#140810' : '#fff1f5');
    };
    if(btn){
      btn.onclick = function(){
        var curTheme = document.documentElement.getAttribute('data-theme') || 'light';
        var nextTheme = curTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        updateThemeIcon();
        updateMetaTheme(nextTheme);
      };
    }
    var initialTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if(!document.documentElement.hasAttribute('data-theme')) document.documentElement.setAttribute('data-theme',initialTheme);
    updateThemeIcon();
    updateMetaTheme(document.documentElement.getAttribute('data-theme') || initialTheme);
  }

  /* ====== TOAST & MODAL CONTROLLER ====== */
  function toast(msg){
    var t = $('toast');
    if(!t) return;
    t.innerHTML = C.ICONS.check + '<span>' + esc(msg) + '</span>';
    t.style.display = 'flex';
    clearTimeout(toastT);
    toastT = setTimeout(function(){ t.style.display = 'none'; }, 3800);
  }

  var mbg = $('mbg'), mbox = $('mbox');
  function openModal(html, bind, isLarge){
    mbox.className = 'modal-box' + (isLarge ? ' lg' : '');
    mbox.innerHTML = html;
    mbg.classList.add('show');
    if(bind) bind(mbox);
  }

  function closeModal(){
    mbg.classList.remove('show');
    mbox.innerHTML = '';
  }

  mbg.addEventListener('mousedown', function(e){ if(e.target === mbg) closeModal(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeModal(); });

  function safe(fn){
    return DBUtils.safe(fn, toast);
  }

  /* ====== KALKULASI IURAN KAS ====== */
  function getEff(){
    if(cur.eff) return cur.eff;
    var eff = []; for(var m = 0; m < 12; m++) eff.push({});
    cur.students.forEach(function(s){
      var carry = 0;
      for(var mi = 0; mi < 12; mi++){
        var raw = (cur.payMap[mi] && cur.payMap[mi][s.id]) || 0;
        var total = raw + carry, shown = total, out = 0;
        if(mi < 11 && total > dueCap(mi)){ shown = dueCap(mi); out = total - dueCap(mi); }
        eff[mi][s.id] = {raw: raw, carryIn: carry, shown: shown, carryOut: out};
        carry = out;
      }
    });
    cur.eff = eff; return eff;
  }

  function monthSummary(mi){
    var e = getEff()[mi], kas = 0, inn = 0, out = 0;
    Object.keys(e).forEach(function(k){ kas += e[k].shown; });
    cur.notes.forEach(function(n){ if(n.m === mi){ if(n.type === 'in') inn += n.amt; else out += n.amt; } });
    return {kas: kas, inn: inn, out: out, saldo: kas + inn - out};
  }

  function checksOf(shown, carryIn, mi){
    var v = dueValue(mi), c = Math.floor(shown / v), r = shown - c * v;
    var cc = Math.min(c, Math.floor(carryIn / v));
    var html = '';
    for(var i = 0; i < C.MAX_CHECKS; i++){
      if(i < cc) html += '<span class="check-pill carry" title="Bawaan bulan sebelumnya">✓</span>';
      else if(i < c) html += '<span class="check-pill done" title="Lunas bulan ini">✓</span>';
      else html += '<span class="check-pill">•</span>';
    }
    return {c: c, r: r, html: html};
  }

  function dueValue(mi){
    var c = cur && classes.filter(function(x){ return x.id === cur.id; })[0];
    if(c && c.monthlyDues && mi !== undefined && Number(c.monthlyDues[mi]) > 0) return Number(c.monthlyDues[mi]);
    return Math.max(1, Number(c && c.monthlyDue) || Number(c && c.weeklyDue) || C.DEFAULT_DUE);
  }

  function dueCap(mi){
    return dueValue(mi) * C.MAX_CHECKS;
  }

  function scheduleSync(){
    clearTimeout(syncT);
    syncT = setTimeout(syncSummary, 800);
  }

  function syncSummary(){
    clearTimeout(syncT); syncT = null;
    if(!cur || cur.role !== 'admin' || !cur.allLoaded) return Promise.resolve();
    var saldo = 0; for(var mi = 0; mi < 12; mi++) saldo += monthSummary(mi).saldo;
    var count = cur.students.length, id = cur.id;
    var c = classes.filter(function(x){ return x.id === id; })[0];
    if(!c || (c.saldo === saldo && c.studentCount === count)) return Promise.resolve();
    return DB.doc('classes/' + id).update({saldo: saldo, studentCount: count}).catch(function(){});
  }

  /* ====== APP INITIALIZATION ====== */
  function init(){
    try {
      initTheme();
      DB = DBUtils.createNeonDB();
      DL = {
        save: function(o){
          var blob = new Blob([o.data], {type: 'application/json'}), a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = o.filename; a.click();
          setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
          return Promise.resolve();
        }
      };

      IS_OWNER = false;
      CAN_WRITE = false;
      renderHero();
      renderMain();

      DB.collection('classes').onSnapshot(function(snap){
        classesLoaded = true;
        classes = snap.docs
          .filter(function(d){ return d.id && d.id !== 'undefined' && d.id !== 'null' && d.id !== 'NaN'; })
          .map(function(d){ var x = d.data() || {}; x.id = d.id; return x; })
          .filter(function(c){ return c && c.name && typeof c.name === 'string' && c.name.trim().length > 0; })
          .sort(function(a, b){ return (a.createdAt || 0) - (b.createdAt || 0); });
        if(screen === 'home'){ renderHero(); renderMain(); }
        else if(cur){
          var c = classes.filter(function(x){ return x.id === cur.id; })[0];
          if(!c){ toast('Kelas ini sudah dihapus.'); leaveClass(); }
          else { cur.eff = null; renderHero(); renderMain(); }
        }
      }, function(e){
        classesLoaded=true;
        $('main').innerHTML='<div class="card empty-state"><h3>Neon belum bisa dihubungi</h3><p>'+esc(e&&e.message||'Periksa URL Neon API dan koneksi internet.')+'</p></div>';
      });
    } catch(e){
      $('main').innerHTML = '<div class="card empty-state"><div class="empty-icon">⚠️</div><h3>Neon belum terhubung</h3><p>'+esc(e.message||'Isi URL API Neon di js/neon-config.js dan deploy fungsi Neon terlebih dahulu.')+'</p></div>';
    }
  }

  /* ====== HERO & NAVIGATION ====== */
  function renderHero(){
    var hc = $('heroContent');
    var pills = $('homePills');
    var navBrand = $('navBrand');
    navBrand.onclick = function(){ if(screen !== 'home') leaveClass(); };
    var ownerBtn=$('btnOwner');
    if(ownerBtn){
      ownerBtn.textContent=DB && DB.auth.role!=='public' ? 'Keluar '+(DB.auth.role==='owner'?'Owner':'Admin') : 'Login Owner';
      ownerBtn.onclick=function(){
        if(!DB || DB.auth.role==='public'){openOwnerModal();return;}
        var done=cur?leaveClass(true):Promise.resolve();
        done.then(function(){return DB.auth.logout();}).then(function(){IS_OWNER=false;CAN_WRITE=false;renderHero();renderMain();toast('Sesi berakhir.');});
      };
    }

    if(screen === 'home'){
      $('tabsbar').style.display = 'none';
      pills.style.display = 'flex';
      pills.querySelectorAll('.nav-pill').forEach(function(b){
        b.className = 'nav-pill ' + (b.dataset.ht === homeTab ? 'on' : '');
        b.onclick = function(){
          homeTab = b.dataset.ht;
          pills.querySelectorAll('.nav-pill').forEach(function(p){ p.classList.toggle('on', p === b); });
          renderHero(); renderMain();
        };
      });

      hc.innerHTML = '<div class="hero-eyebrow">Pengelolaan Keuangan Kelas</div>'
        + '<h1>Uang Kas Kelas</h1>'
        + '<p class="sub">Catat iuran bulanan, kelola catatan keuangan, dan buat format pesan WhatsApp otomatis untuk grup kelas dalam satu tempat.</p>'
        + '<div class="hero-meta"><span class="chip">' + classes.length + ' Kelas Aktif</span><span class="chip">Tahun Ajaran ' + C.START_YEAR + '/' + (C.START_YEAR + 1) + '</span></div>';
    } else {
      pills.style.display = 'none';
      var c = classes.filter(function(x){ return x.id === cur.id; })[0];
      var name = c ? c.name : '';
      var admin = cur.role === 'admin';

      hc.innerHTML = '<button class="btn-back" id="btnBack">' + C.ICONS.arrowLeft + ' Semua Kelas</button>'
        + '<div class="hero-eyebrow">Kelas Aktif</div>'
        + '<h1>' + esc(name) + '</h1>'
        + '<p class="sub">Periode Ajaran Agustus ' + C.START_YEAR + ' – Juli ' + (C.START_YEAR + 1) + '</p>'
        + '<div class="hero-meta">'
        + '<span class="chip ' + (admin ? 'admin' : 'member') + '">' + (admin ? '🛡️ Admin Pengurus' : '👁️ Anggota (Hanya Lihat)') + '</span>'
        + '<span class="chip">💰 Iuran Kas: ' + rp(dueValue(+cur.tab.slice(1) || 0)) + ' / siswa / bulan</span>'
        + '</div>';

      $('btnBack').onclick = function(){ leaveClass(); };
      renderMonthTabs();
    }
  }

  function openOwnerModal(){
    openModal('<div class="modal-title">Akses Owner</div>'
      + '<div class="modal-desc">Login untuk mengelola semua kelas. Saat pertama kali, buat akun Owner menggunakan kunci setup dari pengaturan Neon Function.</div>'
      + '<div class="form-group"><label class="form-label" for="ownerPw">Password Owner</label>'+pwField('ownerPw','Minimal 10 karakter')+'</div>'
      + '<div class="form-group"><label class="form-label" for="setupKey">Kunci setup awal</label><input id="setupKey" type="password" autocomplete="off" placeholder="Hanya diperlukan sekali saat setup pertama"></div>'
      + '<div class="neg" id="ownerErr" style="display:none;margin-top:8px"></div>'
      + '<div class="modal-actions"><button class="btn ghost" id="ownerCancel">Batal</button><button class="btn ghost" id="ownerSetup">Setup Owner</button><button class="btn" id="ownerLogin">Login</button></div>',function(root){
      bindPw(root); $('ownerCancel').onclick=closeModal;
      function finish(p){
        $('ownerLogin').disabled=true; $('ownerSetup').disabled=true;
        p.then(function(){IS_OWNER=true;CAN_WRITE=true;closeModal();renderHero();renderMain();toast('Login Owner berhasil.');}).catch(function(e){
          $('ownerLogin').disabled=false;$('ownerSetup').disabled=false;$('ownerErr').style.display='block';$('ownerErr').textContent=e.message||'Login Owner gagal.';
        });
      }
      $('ownerLogin').onclick=function(){var pw=$('ownerPw').value;if(!pw){toast('Isi password Owner.');return;}finish(DB.auth.ownerLogin(pw));};
      $('ownerSetup').onclick=function(){var pw=$('ownerPw').value,key=$('setupKey').value;if(pw.length<10){toast('Password Owner minimal 10 karakter.');return;}if(!key){toast('Masukkan kunci setup yang disimpan sebagai secret di Neon.');return;}finish(DB.auth.ownerSetup(key,pw));};
    });
  }

  function renderMonthTabs(){
    var tabsbar = $('tabsbar');
    tabsbar.style.display = 'block';
    var t = $('tabs');
    t.innerHTML = C.BULAN.map(function(b,i){return '<button class="tab '+(cur.tab==='m'+i?'on':'')+'" data-t="m'+i+'"><span class="tab-dot"></span>'+b.slice(0,3)+'</button>';}).join('');
    t.querySelectorAll('.tab').forEach(function(el){el.onclick=function(){setTab(el.dataset.t);};});

    var sections = $('sectionTabs');
    sections.innerHTML = (cur.role === 'admin' ? '<button class="tab ' + (cur.tab === 'siswa' ? 'on' : '') + '" data-t="siswa">👥 Daftar Siswa</button>' : '')
      + '<button class="tab ' + (cur.tab === 'recap' ? 'on' : '') + '" data-t="recap">📊 Rekap & Transaksi</button>';
    sections.querySelectorAll('[data-t]').forEach(function(el){ el.onclick = function(){ setTab(el.dataset.t); }; });

    var act = t.querySelector('.tab.on');
    if(act) t.scrollLeft = act.offsetLeft - t.clientWidth / 2 + act.clientWidth / 2;
  }

  function setTab(tab){
    cur.tab = tab; cur.openRecap = null;
    renderHero(); renderMain();
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function weekToMonth(weekIndex){
    var week=C.WEEKS[weekIndex];
    return week ? (week.start.getUTCMonth()+5)%12 : 0;
  }
  function defaultMonthTab(){
    var d=new Date(), year=d.getFullYear(), month=d.getMonth();
    var schoolYear=month>=7?year:year-1, index=(month+5)%12;
    return schoolYear===C.START_YEAR?'m'+index:'m0';
  }

  function renderMain(){
    if(screen === 'home'){
      if(homeTab === 'share') renderShare();
      else renderHome();
    } else {
      renderBody();
    }
  }

  /* ====== HOME SCREEN ====== */
  function renderHome(){
    var main = $('main');
    if(!classesLoaded){
      main.innerHTML = '<div class="card empty-state"><div class="empty-icon">' + C.ICONS.wallet + '</div><h3>Memuat data...</h3></div>';
      return;
    }

    var totalSaldo = 0;
    var totalStudents = 0;
    classes.forEach(function(c){
      totalSaldo += (c.saldo || 0);
      totalStudents += (c.studentCount || 0);
    });

    var banner = '<div class="home-banner">'
      + '<div class="home-banner-info"><h2>Ringkasan Keuangan Kelas</h2><p>Kelola uang kas dengan transparan, mudah dicatat bendahara, dan dapat dibagikan langsung ke grup WhatsApp wali murid atau siswa.</p></div>'
      + '<div class="home-banner-stat">'
      + '<div class="home-stat-box"><b>' + classes.length + '</b><span>Total Kelas</span></div>'
      + '<div class="home-stat-box"><b>' + totalStudents + '</b><span>Siswa</span></div>'
      + '<div class="home-stat-box"><b class="pos">' + rp(totalSaldo) + '</b><span>Total Kas</span></div>'
      + '</div></div>';

    var cards = classes.map(function(c){
      var count = c.studentCount || 0;
      return '<div class="class-card" data-open="' + c.id + '">'
        + '<div class="class-card-top">'
        + '<div class="class-card-header"><h3>' + esc(c.name) + '</h3><p>' + count + ' Siswa Terdaftar · ' + rp(c.monthlyDue || c.weeklyDue || C.DEFAULT_DUE) + ' / bln</p></div>'
        + (IS_OWNER ? '<div class="class-actions" onclick="event.stopPropagation()">'
        + '<button data-edit="' + c.id + '" title="Ubah Kelas">Ubah</button>'
        + '<button data-del="' + c.id + '" title="Hapus Kelas">Hapus</button>'
        + '</div>' : '') + '</div>'
        + '<div class="class-card-bottom">'
        + '<div class="class-card-saldo"><span>Total Saldo Kas</span><b>' + rp(c.saldo || 0) + '</b></div>'
        + '<div class="class-enter-hint">Buka Kelas →</div>'
        + '</div></div>';
    }).join('');

    var addCard = IS_OWNER ? '<button class="add-class-card" data-add="1">'
      + '<div class="add-class-icon">' + C.ICONS.plus + '</div>'
      + '<span>Tambah Kelas Baru</span>'
      + '</button>' : '';

    var empty = (!classes.length) ? '<div class="card empty-state"><div class="empty-icon">' + C.ICONS.wallet + '</div><h3>Belum Ada Kelas</h3><p>'+(IS_OWNER?'Mulai dengan menambahkan kelas pertama Anda untuk mengelola kas secara rapi.':'Belum ada kelas yang tersedia.')+'</p>'+(IS_OWNER?'<button class="btn" data-add="1">'+C.ICONS.plus+' Tambah Kelas Sekarang</button>':'')+'</div>' : '';

    var header = '<div class="card-header"><div class="card-title">Daftar Kelas</div>'+(IS_OWNER?'<button class="btn sm" data-add="1">'+C.ICONS.plus+' Tambah Kelas</button>':'')+'</div>';

    main.innerHTML = banner + header + empty + '<div class="class-grid">' + cards + addCard + '</div>';

    main.querySelectorAll('[data-open]').forEach(function(el){ el.onclick = function(){ openRoleModal(el.dataset.open); }; });
    main.querySelectorAll('[data-add]').forEach(function(el){ el.onclick = function(){ openClassModal(null); }; });
    main.querySelectorAll('[data-edit]').forEach(function(el){ el.onclick = function(){ openClassModal(el.dataset.edit); }; });
    main.querySelectorAll('[data-del]').forEach(function(el){ el.onclick = function(){ openDeleteModal(el.dataset.del); }; });
  }

  /* ====== MODAL: PILIH PERAN MASUK ====== */
  function openRoleModal(cid){
    var c = classes.filter(function(x){ return x.id === cid; })[0]; if(!c) return;
    openModal('<div class="modal-title">' + esc(c.name) + '</div><div class="modal-desc">Pilih cara masuk untuk membuka data kelas ini.</div>'
      + '<div class="role-grid">'
      + '<button class="role-card" id="roleAdmin"><div class="role-icon">🛡️</div><b>Admin Pengurus</b><span>Bisa mencatat pembayaran, pengeluaran, dan mengedit daftar siswa.</span></button>'
      + '<button class="role-card" id="roleMember"><div class="role-icon">👁️</div><b>Anggota / Siswa</b><span>Melihat daftar nama, status pembayaran kas, dan rekap keuangan saja.</span></button>'
      + '</div><div id="adminStep"></div>'
      + '<div class="modal-actions"><button class="btn ghost" id="rmClose">Tutup</button></div>', function(){
      $('rmClose').onclick = closeModal;
      $('roleMember').onclick = function(){ closeModal(); enterClass(cid, 'member'); };
      $('roleAdmin').onclick = function(){
        var step = $('adminStep');
        if(IS_OWNER){ closeModal(); enterClass(cid, 'admin'); return; }

        step.innerHTML = '<div class="form-group" style="margin-top:12px"><label class="form-label" for="admPw">Password Admin</label>'
          + pwField('admPw', 'Masukkan password admin')
          + '<div class="neg" id="admErr" style="display:none;font-size:12.5px;margin-top:6px"></div></div>'
          + '<div class="modal-actions"><button class="btn" id="admGo">Masuk Sebagai Admin</button></div>';
        bindPw(step);

        var go = function(){
          var pw = $('admPw').value;
          if(!pw) return;
          $('admGo').disabled = true;
          DB.auth.adminLogin(cid,pw).then(function(){closeModal();enterClass(cid,'admin');}).catch(function(e){
            $('admGo').disabled=false;$('admErr').style.display='block';$('admErr').textContent=e.message||'Password salah. Silakan coba lagi.';$('admPw').select();
          });
        };
        $('admGo').onclick = go;
        $('admPw').onkeydown = function(e){ if(e.key === 'Enter') go(); };
        $('admPw').focus();
      };
    });
  }

  /* ====== MODAL: TAMBAH / UBAH KELAS ====== */
  function openClassModal(cid){
    var c = cid ? classes.filter(function(x){ return x.id === cid; })[0] : null;
    openModal('<div class="modal-title">' + (c ? 'Ubah Informasi Kelas' : 'Tambah Kelas Baru') + '</div>'
      + '<div class="modal-desc">Setiap kelas memiliki daftar siswa, iuran bulanan, dan catatan transaksi tersendiri.</div>'
      + '<div class="form-group"><label class="form-label" for="cName">Nama Kelas</label><input id="cName" placeholder="Contoh: XII MIPA 2" autocomplete="off" value="' + (c ? esc(c.name) : '') + '"></div>'
      + '<div class="form-group"><label class="form-label" for="cDue">Iuran Kas per Siswa per Bulan (Rp)</label><input id="cDue" type="number" min="500" step="500" inputmode="numeric" placeholder="2000" value="' + (c ? (c.monthlyDue || c.weeklyDue || C.DEFAULT_DUE) : C.DEFAULT_DUE) + '"></div>'
      + '<div class="form-group"><label class="form-label" for="cPw">Password Admin Kelas</label>' + pwField('cPw', c ? 'Kosongkan jika tidak ingin mengubah password' : 'Minimal 4 karakter') + '<p class="modal-desc" style="margin-top:6px;font-size:12px">Password ini digunakan bendahara kelas untuk login sebagai admin pengurus.</p></div>'
      + '<div class="modal-actions"><button class="btn ghost" id="cCancel">Batal</button><button class="btn" id="cSave">Simpan Kelas</button></div>', function(root){
      bindPw(root);
      $('cCancel').onclick = closeModal;
      var save = function(){
        var name = $('cName').value.trim(), pw = $('cPw').value, monthlyDue = Math.round(Number($('cDue').value));
        if(!name){ toast('Nama kelas wajib diisi.'); return; }
        if(!monthlyDue || monthlyDue < 500){ toast('Nominal iuran minimal Rp 500.'); return; }
        if(!c && pw.length < 4){ toast('Password admin minimal 4 karakter.'); return; }
        if(c && pw && pw.length < 4){ toast('Password admin minimal 4 karakter.'); return; }
        $('cSave').disabled = true;
        Promise.resolve().then(function(){
          if(c){
            var upd = {name: name, monthlyDue: monthlyDue};
            if(pw) upd.adminPassword = pw;
            return safe(function(){ return DB.doc('classes/' + c.id).update(upd); }).then(function(ok){
              if(ok){ closeModal(); toast('Kelas berhasil diperbarui!'); } else $('cSave').disabled = false;
            });
          }
          var newId = uid();
          var ref = DB.collection('classes').doc(newId);
          return safe(function(){
            return ref.set({
              name: name,
              adminPassword: pw,
              monthlyDue: monthlyDue,
              studentCount: 0,
              saldo: 0,
              createdAt: Date.now()
            });
          }).then(function(ok){
            if(ok){
              closeModal();
              toast('Kelas "' + name + '" berhasil dibuat!');
              enterClass(newId, 'admin', 'siswa');
            } else {
              $('cSave').disabled = false;
            }
          });
        });
      };
      $('cSave').onclick = save;
      root.querySelectorAll('input').forEach(function(i){ i.onkeydown = function(e){ if(e.key === 'Enter') save(); }; });
      setTimeout(function(){ $('cName').focus(); }, 60);
    });
  }

  function openDeleteModal(cid){
    var c = classes.filter(function(x){ return x.id === cid; })[0]; if(!c) return;
    openModal('<div class="modal-title">Hapus Kelas Ini?</div><div class="modal-desc">Kelas <b>' + esc(c.name) + '</b> beserta seluruh data siswa, riwayat pembayaran, dan catatan kas akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</div>'
      + '<div class="modal-actions"><button class="btn ghost" id="dNo">Batal</button><button class="btn danger" id="dYes">Ya, Hapus Kelas</button></div>', function(){
      $('dNo').onclick = closeModal;
      $('dYes').onclick = function(){
        $('dYes').disabled = true;
        var base = 'classes/' + cid;
        safe(function(){ return DB.doc(base).delete(); }).then(function(ok){
          if(ok){ closeModal(); toast('Kelas berhasil dihapus beserta seluruh riwayatnya.'); }
          else $('dYes').disabled = false;
        });
      };
    });
  }

  /* ====== MASUK / KELUAR KELAS ====== */
  function enterClass(cid, role, tab){
    if(!cid || cid === 'undefined' || cid === 'null'){
      leaveClass();
      return;
    }
    if(cur) leaveClass(true);
    cur = {
      id: cid, role: role, tab: tab || defaultMonthTab(),
      students: [], payMap: {}, payDocs: [], notes: [],
      loaded: {students: false, pay: false, notes: false},
      allLoaded: false, eff: null, search: '', filter: 'all',
      openRecap: null, unsubs: []
    };
    screen = 'class';
    subscribeClass(cid);
    renderHero(); renderMain();
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function leaveClass(silent){
    var p = syncSummary();
    if(cur) cur.unsubs.forEach(function(u){ try { u(); } catch(e){} });
    cur = null; screen = 'home';
    if(!silent){ renderHero(); renderMain(); window.scrollTo({top: 0, behavior: 'smooth'}); }
    return p;
  }

  function subscribeClass(cid){
    var base = 'classes/' + cid;
    var onErr = function(){ if(cur && cur.id === cid) toast('Gagal memuat data kelas.'); };
    var mark = function(k){ cur.loaded[k] = true; cur.allLoaded = cur.loaded.students && cur.loaded.pay && cur.loaded.notes; cur.eff = null; onData(); };

    cur.unsubs.push(DB.collection(base + '/students').onSnapshot(function(s){
      if(!cur || cur.id !== cid) return;
      cur.students = s.docs.map(function(d){ var x = d.data(); x.id = d.id; return x; })
        .sort(function(a, b){ return (a.ord || 0) - (b.ord || 0) || String(a.name).localeCompare(String(b.name)); });
      mark('students');
    }, onErr));

    cur.unsubs.push(DB.collection(base + '/pay').onSnapshot(function(s){
      if(!cur || cur.id !== cid) return;
      var pm = {}, payDocs=[];
      s.docs.forEach(function(d){
        var x=d.data(),mi=typeof x.m==='number'?x.m:(typeof x.w==='number'?weekToMonth(x.w):null);
        if(typeof mi==='number'&&x.s){(pm[mi]=pm[mi]||{})[x.s]=(pm[mi][x.s]||0)+(x.amt||0);payDocs.push({id:d.id,student:x.s,month:mi});}
      });
      cur.payMap = pm; cur.payDocs=payDocs; mark('pay');
    }, onErr));

    cur.unsubs.push(DB.collection(base + '/notes').onSnapshot(function(s){
      if(!cur || cur.id !== cid) return;
      cur.notes = s.docs.map(function(d){ var x=d.data(); x.id=d.id; if(typeof x.m!=='number'&&typeof x.w==='number') x.m=weekToMonth(x.w); return x; }).sort(function(a,b){return(a.at||0)-(b.at||0);});
      mark('notes');
    }, onErr));
  }

  function onData(){
    if(!cur || !cur.allLoaded) return;
    var t = cur.tab;
    if(t[0] === 'm'){
      if(cur.students.length && !$('studentList')) renderMonth();
      else if($('sumStats')) updateMonth();
      else renderBody();
    } else if(t === 'recap') renderBody();
    else if(t === 'siswa'){ if(!$('names')) renderBody(); }
  }

  function renderBody(){
    if(!cur) return;
    if(!cur.allLoaded){
      $('main').innerHTML = '<div class="card empty-state"><div class="empty-icon">' + C.ICONS.wallet + '</div><h3>Memuat data kelas...</h3></div>';
      return;
    }
    var t = cur.tab;
    if(t === 'recap') renderRecap();
    else if(t === 'siswa' && cur.role === 'admin') renderStudents();
    else renderMonth();
  }

  /* ====== TAB PEMBAYARAN MINGGUAN ====== */
  function renderMonth(){
    var mi = +cur.tab.slice(1), admin = cur.role === 'admin';
    var html = '<div class="card">'
      + '<div class="card-header">'
      + '<div><div class="stat-label">Bulan Pembayaran</div><div class="card-title">' + C.bulanLabel(mi) + '</div></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button class="btn sm wa" id="btnWaMonth">' + C.ICONS.wa + ' Format WA</button>'
      + (admin ? '<button class="btn sm ghost" id="setDue">⚙️ Atur Nominal</button>' : '')
      + '</div></div>'
      + '<div class="stats-grid" id="sumStats"></div>'
      + '<div id="monthProgress"></div>'
      + '</div>';

    if(!cur.students.length){
      html += '<div class="card empty-state"><div class="empty-icon">' + C.ICONS.users + '</div>'
        + '<h3>Belum Ada Daftar Siswa</h3>'
        + '<p>Tambahkan daftar nama siswa terlebih dahulu agar bendahara bisa mencatat iuran kas.</p>'
        + (admin ? '<button class="btn" id="goSiswa">' + C.ICONS.plus + ' Tambah Daftar Siswa</button>' : '')
        + '</div>';
      $('main').innerHTML = html;
      updateMonth();
      if(admin && $('setDue')) $('setDue').onclick = function(){ openMonthlyDueModal(mi); };
      if($('btnWaMonth')) $('btnWaMonth').onclick = function(){ openWaModal(mi); };
      if(admin && $('goSiswa')) $('goSiswa').onclick = function(){ setTab('siswa'); };
      return;
    }

    html += '<div class="filter-bar">'
      + '<div class="filter-pills" id="filterPills">'
      + '<button class="filter-pill ' + (cur.filter === 'all' ? 'on' : '') + '" data-f="all">Semua Siswa (' + cur.students.length + ')</button>'
      + '<button class="filter-pill paid ' + (cur.filter === 'paid' ? 'on' : '') + '" data-f="paid">✓ Lunas</button>'
      + '<button class="filter-pill unpaid ' + (cur.filter === 'unpaid' ? 'on' : '') + '" data-f="unpaid">⏳ Belum Bayar</button>'
      + '</div>'
      + '<div class="searchbox">' + C.ICONS.search + '<input id="searchInput" type="search" placeholder="Cari nama siswa..." autocomplete="off" value="' + esc(cur.search) + '"><button id="searchClear" class="sclear" style="display:' + (cur.search ? 'grid' : 'none') + '">✕</button></div>'
      + '</div>'
      + '<div class="student-list" id="studentList"></div>';

    $('main').innerHTML = html;
    if(admin && $('setDue')) $('setDue').onclick = function(){ openMonthlyDueModal(mi); };
    if($('btnWaMonth')) $('btnWaMonth').onclick = function(){ openWaModal(mi); };

    var si = $('searchInput'), sc = $('searchClear');
    si.oninput = function(){ cur.search = si.value; sc.style.display = cur.search ? 'grid' : 'none'; updateMonth(); };
    sc.onclick = function(){ cur.search = ''; si.value = ''; sc.style.display = 'none'; updateMonth(); si.focus(); };

    $('filterPills').querySelectorAll('.filter-pill').forEach(function(btn){
      btn.onclick = function(){
        cur.filter = btn.dataset.f;
        $('filterPills').querySelectorAll('.filter-pill').forEach(function(b){ b.classList.toggle('on', b === btn); });
        updateMonth();
      };
    });

    updateMonth();
  }

  function updateMonth(){
    var mi = +cur.tab.slice(1), admin = cur.role === 'admin';
    var eff = getEff()[mi], ms = monthSummary(mi);
    var due = dueValue(mi);

    var paidCount = 0;
    var fullCount = 0;
    cur.students.forEach(function(s){
      var e = eff[s.id] || {shown: 0};
      if(e.shown >= due) fullCount++;
      if(e.shown > 0) paidCount++;
    });

    var pct = cur.students.length ? Math.round((fullCount / cur.students.length) * 100) : 0;

    if($('sumStats')){
      $('sumStats').innerHTML = '<div class="stat-card"><span class="stat-label">Nominal Kas / Siswa</span><b class="stat-value">' + rp(due) + '</b><span class="stat-meta">Per bulan</span></div>'
        + '<div class="stat-card"><span class="stat-label">Terkumpul Bulan Ini</span><b class="stat-value pos">' + rp(ms.kas) + '</b><span class="stat-meta">' + paidCount + ' siswa telah bayar</span></div>'
        + '<div class="stat-card"><span class="stat-label">Status Kelunasan</span><b class="stat-value">' + pct + '%</b><span class="stat-meta">' + fullCount + ' dari ' + cur.students.length + ' siswa lunas</span></div>';
    }

    if($('monthProgress')){
      $('monthProgress').innerHTML = '<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:var(--muted)"><span>Progres Pembayaran Bulan Ini</span><span>' + fullCount + '/' + cur.students.length + ' Siswa</span></div>'
        + '<div class="progress-bar-wrap"><div class="progress-bar-fill' + (pct >= 100 ? ' full' : '') + '" style="width:' + pct + '%"></div></div>';
    }

    var list = $('studentList'); if(!list) return;
    var q = (cur.search || '').trim().toLowerCase();
    var filter = cur.filter || 'all';

    var rows = cur.students.map(function(s, i){ return {s: s, i: i}; }).filter(function(x){
      var s = x.s, e = eff[s.id] || {shown: 0};
      var matchSearch = !q || s.name.toLowerCase().indexOf(q) >= 0;
      if(!matchSearch) return false;
      if(filter === 'paid') return e.shown >= due;
      if(filter === 'unpaid') return e.shown < due;
      return true;
    });

    if(!rows.length){
      list.innerHTML = '<div class="card empty-state"><div class="empty-icon">' + C.ICONS.search + '</div><h3>Tidak Ditemukan</h3><p>Tidak ada siswa yang sesuai dengan filter atau kata kunci pencarian.</p></div>';
      return;
    }

    list.innerHTML = rows.map(function(x){
      var s = x.s, e = eff[s.id] || {shown: 0, carryIn: 0, carryOut: 0};
      var ck = checksOf(e.shown, e.carryIn, mi);
      var nameHtml = esc(s.name);
      if(q){
        var idx = s.name.toLowerCase().indexOf(q);
        nameHtml = esc(s.name.slice(0, idx)) + '<mark style="background:var(--primary-light);color:var(--primary);font-weight:700">' + esc(s.name.slice(idx, idx + q.length)) + '</mark>' + esc(s.name.slice(idx + q.length));
      }

      var subs = [];
      if(e.carryIn > 0) subs.push('<span class="student-sub-badge carry-in">Bawaan ' + rp(e.carryIn) + ' dari bulan sebelumnya</span>');
      if(e.carryOut > 0) subs.push('<span class="student-sub-badge carry-out">Lebih ' + rp(e.carryOut) + ' ke bulan berikutnya</span>');

      var isFull = e.shown >= due;
      var isPartial = e.shown > 0 && e.shown < due;
      var statusBadge = isFull ? '<span class="student-status-badge lunas">Lunas</span>' : (isPartial ? '<span class="student-status-badge sebagian">Kurang ' + rp(due - e.shown) + '</span>' : '<span class="student-status-badge belum">Belum Bayar</span>');

      return '<div class="student-row' + (admin ? ' click' : '') + '" data-id="' + s.id + '" title="' + (admin ? 'Klik untuk mencatat pembayaran' : '') + '">'
        + '<div class="student-left">'
        + '<div class="student-num">' + (x.i + 1) + '</div>'
        + '<div class="student-avatar" style="' + getAvatarStyle(s.name) + '">' + getInitials(s.name) + '</div>'
        + '<div class="student-info">'
        + '<div class="student-name">' + nameHtml + '</div>'
        + (subs.length ? '<div class="student-subs">' + subs.join('') + '</div>' : '')
        + '</div></div>'
        + '<div class="student-right">'
        + '<div class="checks-bubble">' + ck.html + '</div>'
        + '<div class="student-amount">'
        + '<div class="student-amount-val">' + (e.shown ? rp(e.shown) : '<span style="color:var(--muted-light)">—</span>') + '</div>'
        + statusBadge
        + '</div>'
        + (admin ? '<div style="color:var(--muted)">›</div>' : '')
        + '</div></div>';
    }).join('');

    if(admin){
      list.querySelectorAll('.student-row').forEach(function(el){
        el.onclick = function(){ openPayModal(mi, el.dataset.id); };
      });
    }
  }

  /* ====== MODAL: ATUR NOMINAL BULANAN ====== */
  function openMonthlyDueModal(mi){
    var c = classes.filter(function(x){ return x.id === cur.id; })[0]; if(!c) return;
    openModal('<div class="modal-title">Atur Nominal Iuran Kas</div><div class="modal-desc">Khusus untuk bulan <b>' + C.bulanLabel(mi) + '</b>. Nilai ini menjadi acuan kelunasan dan 4 centang per siswa.</div>'
      + '<div class="form-group"><label class="form-label" for="dueInput">Nominal Kas Bulan Ini (Rp)</label><input id="dueInput" type="number" min="500" step="500" inputmode="numeric" value="' + dueValue(mi) + '"></div>'
      + '<div class="preset-chips">'
      + '<button class="preset-chip" onclick="$(\'dueInput\').value=2000">Rp 2.000</button>'
      + '<button class="preset-chip" onclick="$(\'dueInput\').value=3000">Rp 3.000</button>'
      + '<button class="preset-chip" onclick="$(\'dueInput\').value=5000">Rp 5.000</button>'
      + '<button class="preset-chip" onclick="$(\'dueInput\').value=10000">Rp 10.000</button>'
      + '</div>'
      + '<div class="modal-actions"><button class="btn ghost" id="dueCancel">Batal</button><button class="btn" id="dueSave">Simpan Nominal</button></div>', function(){
      $('dueCancel').onclick = closeModal;
      $('dueSave').onclick = function(){
        var val = Math.round(Number($('dueInput').value));
        if(!val || val < 500){ toast('Nominal tidak valid.'); return; }
        var dues = Object.assign({}, c.monthlyDues || {}); dues[mi] = val;
        $('dueSave').disabled = true;
        safe(function(){ return DB.doc('classes/' + cur.id).update({monthlyDues: dues}); }).then(function(ok){
          if(ok){ cur.eff = null; closeModal(); renderMain(); toast('Nominal ' + C.bulanLabel(mi) + ' berhasil disimpan!'); }
          else $('dueSave').disabled = false;
        });
      };
    });
  }

  /* ====== MODAL: CATAT PEMBAYARAN SISWA ====== */
  function openPayModal(mi, sid){
    var s = cur.students.filter(function(x){ return x.id === sid; })[0]; if(!s) return;
    var e = getEff()[mi][sid] || {raw: 0, carryIn: 0};
    var raw = e.raw;
    var due = dueValue(mi);

    openModal('<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
      + '<div class="student-avatar" style="' + getAvatarStyle(s.name) + ';width:46px;height:46px;font-size:16px">' + getInitials(s.name) + '</div>'
      + '<div><div class="modal-title" style="margin:0">' + esc(s.name) + '</div><div class="modal-desc" style="margin:0">Pembayaran Kas: ' + C.bulanLabel(mi) + '</div></div>'
      + '</div>'
      + '<div class="form-group"><label class="form-label">Jumlah Pembayaran (Rp)</label>'
      + '<input id="pInput" placeholder="Contoh: 2k, 5000, 10k" autocomplete="off" inputmode="text" value="' + (raw ? raw : '') + '">'
      + '<div class="preset-chips">'
      + '<button class="preset-chip" id="chipLunas">Lunas (' + rp(due) + ')</button>'
      + '<button class="preset-chip" id="chip2Bln">2 Bulan (' + rp(due*2) + ')</button>'
      + '<button class="preset-chip" id="chip5k">+5.000</button>'
      + '<button class="preset-chip" id="chip10k">+10.000</button>'
      + '<button class="preset-chip" id="chipZero" style="color:var(--danger)">Reset (0)</button>'
      + '</div></div>'
      + (e.carryIn > 0 ? '<div style="font-size:12px;color:var(--carry);margin-bottom:8px">ℹ️ Sudah ada bawaan ' + rp(e.carryIn) + ' dari ' + C.BULAN[mi - 1] + '.</div>' : '')
      + '<div class="preview-box" id="pPrev"></div>'
      + '<div class="modal-actions">'
      + '<button class="btn danger" id="pClear">Hapus Bayar</button>'
      + '<button class="btn ghost" id="pCancel">Batal</button>'
      + '<button class="btn" id="pSave">Simpan</button>'
      + '</div>', function(){
      var inp = $('pInput');
      var preview = function(){
        var v = parseAmount(inp.value), box = $('pPrev');
        if(inp.value.trim() === ''){ v = 0; }
        else if(v === null){ box.innerHTML = '<span class="neg" style="font-weight:700">Format nominal tidak dikenali (contoh: 2k, 5000)</span>'; return; }

        var total = v + e.carryIn, shown = total, out = 0;
        if(mi < 11 && total > dueCap(mi)){ shown = dueCap(mi); out = total - dueCap(mi); }
        var ck = checksOf(shown, e.carryIn, mi);

        var statusText = shown >= due ? '<span class="pos" style="font-weight:700">LUNAS</span>' : (shown > 0 ? '<span class="neg" style="font-weight:700">KURANG ' + rp(due - shown) + '</span>' : '<span style="color:var(--muted)">Belum Ada Pembayaran</span>');

        box.innerHTML = '<div style="display:flex;justify-content:center;gap:4px;margin-bottom:6px">' + ck.html + '</div>'
          + '<div style="font-size:15px;font-weight:800;color:var(--ink)">' + rp(shown) + ' ' + statusText + '</div>'
          + (out ? '<div style="font-size:12px;color:var(--warning);margin-top:4px">⚠️ Kelebihan ' + rp(out) + ' dialihkan otomatis ke ' + C.BULAN[mi + 1] + '</div>' : '');
      };

      inp.oninput = preview;
      $('chipLunas').onclick = function(){ inp.value = due; preview(); };
      $('chip2Bln').onclick = function(){ inp.value = due * 2; preview(); };
      $('chip5k').onclick = function(){ inp.value = (parseAmount(inp.value) || 0) + 5000; preview(); };
      $('chip10k').onclick = function(){ inp.value = (parseAmount(inp.value) || 0) + 10000; preview(); };
      $('chipZero').onclick = function(){ inp.value = ''; preview(); };

      preview();
      inp.onkeydown = function(ev){ if(ev.key === 'Enter') $('pSave').click(); };
      $('pCancel').onclick = closeModal;

      var monthPayDocs=cur.payDocs.filter(function(p){return p.month===mi&&p.student===sid;}), existingPay=monthPayDocs[0];
      var path = 'classes/' + cur.id + '/pay/' + (existingPay ? existingPay.id : mi + '_' + sid);
      $('pClear').onclick = function(){
        $('pClear').disabled = true;
        safe(function(){ return Promise.all((monthPayDocs.length?monthPayDocs:[{id:mi+'_'+sid}]).map(function(p){return DB.doc('classes/'+cur.id+'/pay/'+p.id).delete();})); }).then(function(ok){
          if(ok){ closeModal(); scheduleSync(); toast('Data pembayaran dihapus.'); }
          else $('pClear').disabled = false;
        });
      };

      $('pSave').onclick = function(){
        if(inp.value.trim() === ''){ $('pClear').click(); return; }
        var v = parseAmount(inp.value);
        if(v === null){ toast('Format nominal tidak valid. Contoh: 2k, 5000'); return; }
        if(v <= 0){ $('pClear').click(); return; }
        $('pSave').disabled = true;
        safe(function(){
          return DB.doc(path).set({m:mi,s:sid,amt:v}).then(function(){
            return Promise.all(monthPayDocs.filter(function(p){return p.id!==path.slice(path.lastIndexOf('/')+1);}).map(function(p){return DB.doc('classes/'+cur.id+'/pay/'+p.id).delete();}));
          });
        }).then(function(ok){
          if(ok){ closeModal(); scheduleSync(); toast('Pembayaran disimpan!'); }
          else $('pSave').disabled = false;
        });
      };

      setTimeout(function(){ inp.focus(); inp.select(); }, 50);
    });
  }

  /* ====== MODAL: WHATSAPP REPORT ====== */
  function openWaModal(mi){
    var c = classes.filter(function(x){ return x.id === cur.id; })[0];
    var msg = '';
    if(mi !== undefined){
      msg = Reports.generateWaMonthReport({
        cur: cur,
        mi: mi,
        classInfo: c,
        eff: getEff()[mi],
        monthSummary: monthSummary(mi),
        due: dueValue(mi)
      });
    } else {
      var monthSummaries = C.BULAN.map(function(_, i){ return monthSummary(i); });
      msg = Reports.generateWaRecapReport({
        cur: cur,
        classInfo: c,
        monthSummaries: monthSummaries
      });
    }

    openModal('<div class="modal-title">' + C.ICONS.wa + ' Format Laporan WhatsApp</div>'
      + '<div class="modal-desc">Salin teks laporan siap kirim ke grup WhatsApp kelas atau wali murid.</div>'
      + '<div class="wa-preview" id="waBox">' + esc(msg) + '</div>'
      + '<div class="modal-actions">'
      + '<button class="btn ghost" id="waClose">Tutup</button>'
      + '<button class="btn wa" id="waCopy">' + C.ICONS.wa + ' Salin Teks WhatsApp</button>'
      + '</div>', function(){
      $('waClose').onclick = closeModal;
      $('waCopy').onclick = function(){
        copyText(msg, null, function(){
          toast('Teks laporan WhatsApp berhasil disalin!');
          closeModal();
        });
      };
    }, true);
  }

  /* ====== TAB REKAP & TRANSAKSI ====== */
  function renderRecap(){
    var admin = cur.role === 'admin';
    var keep = null, f = document.querySelector('[data-notes]');
    var nameInput = f && f.querySelector('.nn'), amountInput = f && f.querySelector('.na');
    if(nameInput && amountInput){ keep = {m: f.dataset.notes, n: nameInput.value, a: amountInput.value, t: f.querySelector('.nt') ? f.querySelector('.nt').value : 'out'}; }

    var g = {kas: 0, inn: 0, out: 0, saldo: 0};
    var rows = C.BULAN.map(function(_, i){
      var s = monthSummary(i); g.kas += s.kas; g.inn += s.inn; g.out += s.out; g.saldo += s.saldo;
      var open = cur.openRecap === i;
      return '<tr class="month-row' + (open ? ' open' : '') + '" data-m="' + i + '">'
        + '<td><b>' + (open ? '▾' : '▸') + ' ' + C.bulanLabel(i) + '</b></td>'
        + '<td>' + rp(s.kas) + '</td>'
        + '<td class="pos">' + (s.inn ? '+' + rp(s.inn) : '—') + '</td>'
        + '<td class="neg">' + (s.out ? '-' + rp(s.out) : '—') + '</td>'
        + '<td><b>' + rp(s.saldo) + '</b></td>'
        + '</tr>'
        + (open ? '<tr><td colspan="5" class="recap-panel">' + notesPanel(i, admin) + '</td></tr>' : '');
    }).join('');

    var html = '<div class="card">'
      + '<div class="card-header">'
      + '<div><div class="stat-label">Ringkasan Total</div><div class="card-title">Rekap Keuangan Kas</div></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button class="btn sm wa" id="btnWaRecap">' + C.ICONS.wa + ' Salin Format WA</button>'
      + '<button class="btn sm ghost" onclick="window.print()">' + C.ICONS.print + ' Cetak / PDF</button>'
      + '</div></div>'
      + '<div class="stats-grid">'
      + '<div class="stat-card"><span class="stat-label">Total Saldo Kas</span><b class="stat-value ' + (g.saldo < 0 ? 'neg' : 'pos') + '">' + rp(g.saldo) + '</b><span class="stat-meta">Dana siap pakai</span></div>'
      + '<div class="stat-card"><span class="stat-label">Total Iuran Siswa</span><b class="stat-value">' + rp(g.kas) + '</b><span class="stat-meta">Iuran rutin</span></div>'
      + '<div class="stat-card"><span class="stat-label">Pemasukan Tambahan</span><b class="stat-value pos">' + rp(g.inn) + '</b><span class="stat-meta">Sponsor/donasi</span></div>'
      + '<div class="stat-card"><span class="stat-label">Total Pengeluaran</span><b class="stat-value neg">' + rp(g.out) + '</b><span class="stat-meta">Keperluan kelas</span></div>'
      + '</div></div>'
      + '<div class="card">'
      + '<div class="card-header"><div class="card-title">Rincian Per Bulan</div><div class="card-subtitle">Klik nama bulan untuk melihat detail transaksi</div></div>'
      + '<div class="table-container"><table>'
      + '<thead><tr><th>Bulan</th><th>Iuran Masuk</th><th>Penambahan</th><th>Pengeluaran</th><th>Saldo Akhir</th></tr></thead>'
      + '<tbody>' + rows
      + '<tr class="grand-row"><td>TOTAL SELURUH</td><td>' + rp(g.kas) + '</td><td>+' + rp(g.inn) + '</td><td>-' + rp(g.out) + '</td><td>' + rp(g.saldo) + '</td></tr>'
      + '</tbody></table></div></div>';

    $('main').innerHTML = html;

    if($('btnWaRecap')) $('btnWaRecap').onclick = function(){ openWaModal(); };

    $('main').querySelectorAll('tr.month-row').forEach(function(tr){
      tr.onclick = function(){
        var i = +tr.dataset.m;
        cur.openRecap = cur.openRecap === i ? null : i;
        renderRecap();
      };
    });

    var box = document.querySelector('[data-notes]');
    if(box){
      box.onclick = function(e){ e.stopPropagation(); };
      var mi = +box.dataset.notes;
      if(keep && +keep.m === mi && box.querySelector('.nn')){
        box.querySelector('.nn').value = keep.n;
        box.querySelector('.na').value = keep.a;
        box.querySelector('.nt').value = keep.t;
      }
      var add = box.querySelector('.nadd');
      if(add) add.onclick = function(){
        var name = box.querySelector('.nn').value.trim(), amt = parseAmount(box.querySelector('.na').value), type = box.querySelector('.nt').value;
        if(!name){ toast('Tulis keterangan catatan transaksi.'); return; }
        if(amt === null || amt <= 0){ toast('Jumlah nominal tidak valid. Contoh: 15k atau 15000'); return; }
        add.disabled = true;
        safe(function(){ return DB.collection('classes/' + cur.id + '/notes').doc().set({m: mi, name: name, amt: amt, type: type, at: Date.now()}); }).then(function(ok){
          if(ok){ box.querySelector('.nn').value = ''; box.querySelector('.na').value = ''; scheduleSync(); toast('Catatan ditambahkan!'); }
          add.disabled = false;
        });
      };
      box.querySelectorAll('[data-del]').forEach(function(b){
        b.onclick = function(){
          safe(function(){ return DB.doc('classes/' + cur.id + '/notes/' + b.dataset.del).delete(); }).then(function(ok){
            if(ok){ scheduleSync(); toast('Catatan dihapus.'); }
          });
        };
      });
    }
  }

  function notesPanel(mi, admin){
    var list = cur.notes.filter(function(n){ return n.m === mi; });
    var s = monthSummary(mi);

    return '<div class="notes-box" data-notes="' + mi + '">'
      + '<div class="notes-header"><b>Catatan Transaksi: ' + C.bulanLabel(mi) + '</b><div style="font-size:12.5px;color:var(--muted)">Tambahan: <b class="pos">+' + rp(s.inn) + '</b> · Pengeluaran: <b class="neg">-' + rp(s.out) + '</b></div></div>'
      + (admin ? '<div class="note-form">'
        + '<input class="nn" placeholder="Keterangan (misal: Beli spidol & penghapus)" aria-label="Nama">'
        + '<input class="na" placeholder="Nominal (misal: 15k)" aria-label="Jumlah">'
        + '<select class="nt"><option value="out">Pengeluaran (-)</option><option value="in">Penambahan (+)</option></select>'
        + '<button class="btn nadd sm">' + C.ICONS.plus + ' Tambah</button>'
        + '</div>' : '')
      + (list.length ? list.map(function(x){
          return '<div class="note-item">'
            + '<span class="note-badge ' + x.type + '">' + (x.type === 'in' ? 'Pemasukan' : 'Pengeluaran') + '</span>'
            + '<div class="note-name">' + esc(x.name) + '</div>'
            + '<div class="note-amt ' + (x.type === 'in' ? 'pos' : 'neg') + '">' + (x.type === 'in' ? '+' : '-') + rp(x.amt) + '</div>'
            + (admin ? '<button class="note-del" data-del="' + x.id + '" title="Hapus catatan">✕</button>' : '')
            + '</div>';
        }).join('') : '<div style="text-align:center;color:var(--muted);padding:14px 0;font-size:13px">Belum ada catatan pengeluaran atau penambahan di bulan ini.</div>')
      + '</div>';
  }

  /* ====== TAB DAFTAR SISWA ====== */
  function renderStudents(){
    $('main').innerHTML = '<div class="card">'
      + '<div class="card-header"><div><div class="card-title">Daftar Siswa Kelas</div><div class="card-subtitle">Ketik satu nama siswa per baris. Urutan nomor akan mengikuti urutan baris ini.</div></div></div>'
      + '<div class="form-group"><textarea id="names" style="min-height:300px" placeholder="Ahmad Dani&#10;Budi Santoso&#10;Citra Lestari...">' + esc(cur.students.map(function(s){ return s.name; }).join('\n')) + '</textarea></div>'
      + '<div class="neg" id="namesWarn" style="display:none;margin-bottom:12px;font-size:13px;font-weight:600"></div>'
      + '<div style="display:flex;gap:10px">'
      + '<button class="btn" id="saveNames">Simpan Daftar Siswa</button>'
      + '</div></div>';

    var warned = false;
    $('names').oninput = function(){ warned = false; $('namesWarn').style.display = 'none'; };

    $('saveNames').onclick = function(){
      var names = $('names').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
      var old = cur.students.slice(), used = {}, next = [];
      names.forEach(function(n, i){
        var found = null;
        for(var k = 0; k < old.length; k++){ if(old[k].name === n && !used[old[k].id]){ found = old[k]; break; } }
        if(found){ used[found.id] = true; next.push({id: found.id, name: n, ord: i, write: (found.ord || 0) !== i}); }
        else next.push({id: uid(), name: n, ord: i, write: true});
      });

      var removed = old.filter(function(o){ return !used[o.id]; });
      var withPay = removed.filter(function(r){ return cur.payDocs.some(function(p){ return p.student===r.id; }); });
      if(withPay.length && !warned){
        warned = true; var w = $('namesWarn'); w.style.display = 'block';
        w.textContent = 'Peringatan: ' + withPay.length + ' siswa yang memiliki riwayat pembayaran akan dihapus (' + withPay.map(function(x){ return x.name; }).join(', ') + '). Klik Simpan sekali lagi jika Anda yakin.';
        return;
      }

      var base = 'classes/' + cur.id, ops = [];
      next.forEach(function(s){ if(s.write) ops.push(function(){ return DB.doc(base + '/students/' + s.id).set({name: s.name, ord: s.ord}); }); });
      removed.forEach(function(r){
        ops.push(function(){ return DB.doc(base + '/students/' + r.id).delete(); });
        cur.payDocs.filter(function(p){return p.student===r.id;}).forEach(function(p){ops.push(function(){return DB.doc(base+'/pay/'+p.id).delete();});});
      });

      $('saveNames').disabled = true;
      safe(function(){ return DBUtils.batched(ops, 6); }).then(function(ok){
        if(ok){
          scheduleSync(); toast('Daftar siswa berhasil disimpan!');
          cur.tab = defaultMonthTab();
          renderHero(); renderMain();
          window.scrollTo({top: 0, behavior: 'smooth'});
        } else $('saveNames').disabled = false;
      });
    };
  }

  /* ====== TAB SHARE & BACKUP ====== */
  function renderShare(){
    $('main').innerHTML = '<div class="card">'
      + '<div class="card-header"><div><div class="card-title">Bagikan Aplikasi Kas</div><div class="card-subtitle">Kirim tautan website ini agar bendahara dan siswa lain dapat mengaksesnya.</div></div></div>'
      + '<div class="form-group"><label class="form-label">Tautan Website</label><input id="shareUrl" readonly value="' + esc(location.href) + '"></div>'
      + '<button class="btn" id="copyLink">Salin Tautan Website</button>'
      + '</div>'
      + (IS_OWNER ? '<div class="card">'
      + '<div class="card-header"><div><div class="card-title">Cadangkan & Pulihkan Data</div><div class="card-subtitle">Simpan berkas backup ke komputer atau ponsel untuk cadangan aman atau memindahkan data ke perangkat lain.</div></div></div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + '<button class="btn" id="btnExport">💾 Backup Semua Data (.json)</button>'
      + '<button class="btn ghost" id="btnImport">📥 Restore / Pulihkan Data</button>'
      + '<button class="btn ghost" id="btnMigrateLocal">Pindahkan data browser lama ke Neon</button>'
      + '<input type="file" id="fileImport" accept=".json,application/json" style="display:none">'
      + '</div></div>' : '<div class="card"><p>Data kelas tersimpan di Neon dan dapat dibaca melalui tautan ini. Login sebagai Owner untuk mengelola backup atau memindahkan data lama.</p></div>');

    $('copyLink').onclick = function(){
      if(location.protocol === 'file:'){ toast('Unggah berkas HTML ini ke hosting gratis (seperti Netlify atau Vercel) agar bisa dibuka oleh orang lain lewat internet.'); return; }
      copyText(location.href, $('shareUrl'), function(){ toast('Tautan berhasil disalin!'); });
    };

    if(IS_OWNER){
      $('btnExport').onclick = exportAll;
      $('btnImport').onclick = function(){ $('fileImport').click(); };
      $('fileImport').onchange = importAll;
      $('btnMigrateLocal').onclick=function(){
        $('btnMigrateLocal').disabled=true;
        DB.migrateLegacy().then(function(r){toast((r.documents||0)+' dokumen dipindahkan ke Neon.');setTimeout(function(){location.reload();},1200);}).catch(function(e){$('btnMigrateLocal').disabled=false;toast(e.message||'Migrasi gagal. Data lokal lama tetap disimpan.');});
      };
    }
  }

  function exportAll(){
    var out = {version: 5, classes: []};
    Promise.all(classes.map(function(c){
      var base = 'classes/' + c.id;
      return Promise.all(['students', 'pay', 'notes'].map(function(k){ return DB.collection(base + '/' + k).get(); })).then(function(r){
        var pay = {};
        r[1].docs.forEach(function(d){ var x=d.data(),mi=typeof x.m==='number'?x.m:(typeof x.w==='number'?weekToMonth(x.w):null); if(mi!==null){(pay[mi]=pay[mi]||{})[x.s]=(pay[mi][x.s]||0)+(x.amt||0);} });
        var notes = {};
        r[2].docs.forEach(function(d){ var x=d.data(),mi=typeof x.m==='number'?x.m:(typeof x.w==='number'?weekToMonth(x.w):null); if(mi!==null)(notes[mi]=notes[mi]||[]).push({id:d.id,name:x.name,amount:x.amt,type:x.type}); });
        out.classes.push({id:c.id,name:c.name,monthlyDue:c.monthlyDue||c.weeklyDue||C.DEFAULT_DUE,monthlyDues:c.monthlyDues||{},students:r[0].docs.map(function(d){return{id:d.id,name:d.data().name};}),pay:pay,notes:notes});
      });
    })).then(function(){
      return DL.save({filename: 'backup-uang-kas-' + new Date().toISOString().slice(0, 10) + '.json', data: JSON.stringify(out, null, 2)});
    }).then(function(){ toast('Backup berhasil diunduh!'); }, function(){ toast('Gagal membuat berkas backup.'); });
  }

  function importAll(e){
    var f = e.target.files[0]; if(!f) return;
    var r = new FileReader();
    r.onload = function(){
      var d; try { d = JSON.parse(r.result); } catch(err){ toast('Berkas backup tidak valid.'); return; }
      if(d && d.students && d.pay) d = {classes: [{id: uid(), name: d.className || 'Kelas 1', students: d.students, pay: d.pay, notes: d.notes || {}}]};
      if(!d || !Array.isArray(d.classes)){ toast('Berkas backup tidak valid.'); return; }

      var ops = [], now = Date.now();
      d.classes.forEach(function(c, ci){
        var cid = String(c.id || uid()).replace(/[^A-Za-z0-9_\-]/g, '');
        var base = 'classes/' + cid, saldo = 0, stu = c.students || [];
        var stuIds = {}; stu.forEach(function(s){ stuIds[s.id] = true; });

        var weeklyBackup=Number(d.version)===4||(!c.monthlyDue&&typeof c.weeklyDue==='number');
        Object.keys(c.pay || {}).forEach(function(period){ Object.keys(c.pay[period]).forEach(function(sid){ if(stuIds[sid] && c.pay[period][sid] > 0) saldo += c.pay[period][sid]; }); });
        Object.keys(c.notes || {}).forEach(function(m){ (c.notes[m] || []).forEach(function(n){ saldo += n.type === 'in' ? n.amount : -n.amount; }); });

        ops.push(function(){ return DB.doc(base).set({name:c.name||'Kelas',monthlyDue:c.monthlyDue||c.weeklyDue||C.DEFAULT_DUE,monthlyDues:c.monthlyDues||{},salt:c.salt||'',passHash:c.passHash||'',adminPassword:c.adminPassword||'',studentCount:stu.length,saldo:saldo,createdAt:now+ci}); });
        stu.forEach(function(s, i){ ops.push(function(){ return DB.doc(base + '/students/' + s.id).set({name: s.name, ord: i}); }); });
        var payByMonth={};
        Object.keys(c.pay||{}).forEach(function(period){var mi=weeklyBackup?weekToMonth(Number(period)):Number(period);Object.keys(c.pay[period]).forEach(function(sid){var a=c.pay[period][sid];if(stuIds[sid]&&a>0)(payByMonth[mi]=payByMonth[mi]||{})[sid]=(payByMonth[mi][sid]||0)+a;});});
        Object.keys(payByMonth).forEach(function(period){Object.keys(payByMonth[period]).forEach(function(sid){var a=payByMonth[period][sid];ops.push(function(){return DB.doc(base+'/pay/'+period+'_'+sid).set({m:+period,s:sid,amt:a});});});});
        Object.keys(c.notes||{}).forEach(function(period){var mi=weeklyBackup?weekToMonth(Number(period)):Number(period);(c.notes[period]||[]).forEach(function(n,k){ops.push(function(){return DB.doc(base+'/notes/'+(n.id||uid())).set({m:mi,name:n.name,amt:n.amount,type:n.type,at:now+k});});});});
      });

      toast('Memulihkan data...');
      safe(function(){ return DBUtils.batched(ops, 6); }).then(function(ok){
        if(ok) toast('Data berhasil dipulihkan!');
      });
    };
    r.readAsText(f);
    e.target.value = '';
  }

  // Start application
  init();
})();
