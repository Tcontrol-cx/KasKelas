/* KasKelas monthly report generators */
(function(window){
  'use strict';

  function generateWaMonthReport(params){
    var cur=params.cur, mi=params.mi, c=params.classInfo, eff=params.eff, ms=params.monthSummary, due=params.due;
    var H=window.AppHelpers, C=window.AppConfig, paid=[], unpaid=[];
    cur.students.forEach(function(s,idx){
      var e=eff[s.id]||{shown:0};
      if(e.shown>=due) paid.push((idx+1)+'. '+s.name+(e.shown>due?' (Lebih '+H.rp(e.shown-due)+')':''));
      else if(e.shown>0) paid.push((idx+1)+'. '+s.name+' (Sebagian: '+H.rp(e.shown)+', Kurang: '+H.rp(due-e.shown)+')');
      else unpaid.push((idx+1)+'. '+s.name);
    });
    return '📢 *LAPORAN UANG KAS KELAS*\n'
      +'🏫 *Kelas:* '+(c?c.name:'')+'\n'
      +'🗓️ *Bulan:* '+C.bulanLabel(mi)+'\n'
      +'💰 *Iuran Kas:* '+H.rp(due)+' / siswa\n'
      +'━━━━━━━━━━━━━━━━━━━━\n\n'
      +'✅ *SUDAH BAYAR ('+paid.length+'/'+cur.students.length+'):*\n'+(paid.length?paid.join('\n'):'-(Belum ada)-')+'\n\n'
      +'⏳ *BELUM BAYAR ('+unpaid.length+'):*\n'+(unpaid.length?unpaid.join('\n'):'-(Semua siswa sudah lunas! 🎉)-')+'\n\n'
      +'━━━━━━━━━━━━━━━━━━━━\n'
      +'💵 *Terkumpul bulan ini:* '+H.rp(ms.kas)+'\n'
      +'📊 *Total saldo kas kelas:* '+H.rp(c?c.saldo||0:0)+'\n\n'
      +'_Laporan dibuat via KasKelas_ ✨';
  }

  function generateWaRecapReport(params){
    var cur=params.cur, c=params.classInfo, summaries=params.monthSummaries, H=window.AppHelpers, C=window.AppConfig;
    var g={kas:0,inn:0,out:0,saldo:0};
    var lines=C.BULAN.map(function(_,i){
      var s=summaries[i];g.kas+=s.kas;g.inn+=s.inn;g.out+=s.out;g.saldo+=s.saldo;
      return '• *'+C.bulanLabel(i)+'*: Iuran '+H.rp(s.kas)+' | Saldo '+H.rp(s.saldo);
    });
    return '📊 *REKAP KEUANGAN KAS KELAS*\n'
      +'🏫 *Kelas:* '+(c?c.name:'')+'\n'
      +'🗓️ *Periode:* Agustus '+C.START_YEAR+' – Juli '+(C.START_YEAR+1)+'\n'
      +'━━━━━━━━━━━━━━━━━━━━\n'
      +'💰 *TOTAL SALDO KAS: '+H.rp(g.saldo)+'*\n'
      +'📥 Total iuran siswa: '+H.rp(g.kas)+'\n'
      +'➕ Total pemasukan tambahan: '+H.rp(g.inn)+'\n'
      +'➖ Total pengeluaran kas: '+H.rp(g.out)+'\n'
      +'━━━━━━━━━━━━━━━━━━━━\n\n'
      +'*Rincian bulanan:*\n'+lines.join('\n')+'\n\n'
      +'_Laporan keuangan KasKelas_ 📋';
  }

  window.AppReports={generateWaMonthReport:generateWaMonthReport,generateWaRecapReport:generateWaRecapReport};
})(window);
