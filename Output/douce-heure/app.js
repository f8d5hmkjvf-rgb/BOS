(function(){
  var $ = function(id){ return document.getElementById(id); };

  // Chaque nouvelle page s'ouvre en haut
  try{ if('scrollRestoration' in history) history.scrollRestoration='manual'; }catch(e){}
  var toTop=function(){ window.scrollTo({top:0, left:0, behavior:'instant'}); document.documentElement.scrollTop=0; document.body.scrollTop=0; };
  toTop();
  window.addEventListener('load', function(){ toTop(); setTimeout(toTop, 60); });
  window.addEventListener('pageshow', function(e){ if(e.persisted) toTop(); });

  // Menu mobile
  var sheet = $('sheet'), burger = $('burger');
  function openMenu(o){
    sheet.hidden = !o; burger.setAttribute('aria-expanded', o);
    document.body.classList.toggle('locked', o);
    if(o) $('close').focus(); else burger.focus();
  }
  burger.addEventListener('click', function(){ openMenu(true); });
  $('close').addEventListener('click', function(){ openMenu(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !sheet.hidden) openMenu(false); });

  // Graduations du cadran
  var ns = 'http://www.w3.org/2000/svg';
  document.querySelectorAll('.ticks').forEach(function(g){
    for(var i=0;i<60;i++){
      var a=i*6*Math.PI/180, big=i%5===0, r1=big?160:168, r2=174;
      var l=document.createElementNS(ns,'line');
      l.setAttribute('x1',200+r1*Math.sin(a)); l.setAttribute('y1',200-r1*Math.cos(a));
      l.setAttribute('x2',200+r2*Math.sin(a)); l.setAttribute('y2',200-r2*Math.cos(a));
      l.setAttribute('stroke', big?'var(--ink)':'var(--line)'); l.setAttribute('stroke-width', big?1.5:1);
      g.appendChild(l);
    }
  });

  // La carte (tarifs indicatifs, alignés sur les instituts du secteur)
  var carte = {
    ongles:{t:'Ongles', d:"Mains et pieds soignés, du semi-permanent qui tient trois semaines au nail art sur mesure.", items:[['Semi-permanent mains','45 min',28],['Semi-permanent pieds','45 min',28],['Pose complète gel ou capsules','1 h 15',55],['Remplissage gel','1 h',42],['Nail art (par ongle)','5 min',3],['Dépose','30 min',15]]},
    cils:{t:'Cils', d:"Un regard ouvert sans mascara : rehaussement naturel ou extensions sur mesure.", items:[['Rehaussement de cils','45 min',45],['Rehaussement + teinture','1 h',52],['Extensions pose naturelle','1 h 30',60],['Extensions volume russe','2 h',78],['Remplissage','1 h',38]]},
    maquillage:{t:'Maquillage', d:"Pour un rendez-vous, une soirée ou le plus beau jour de votre vie.", items:[['Maquillage jour','30 min',30],['Maquillage soirée','45 min',42],['Mariée, essai + jour J','2 h 30',120]]},
    massages:{t:'Massages', d:"Une heure pour relâcher les tensions et repartir légère.", items:[['Massage du dos','30 min',35],['Massage relaxant','1 h',60],['Massage californien','1 h',65],['Massage aux pierres chaudes','1 h 15',78]]},
    soins:{t:'Soins visage', d:"Des soins adaptés à votre peau, pour un teint frais et reposé.", items:[['Soin éclat express','30 min',35],['Soin hydratation profonde','1 h',62],['Soin anti-âge','1 h 15',75],['Épilation sourcils','15 min',10]]}
  };
  var keys = Object.keys(carte);

  var tabs = $('tabs');
  if(tabs){
    var menu = $('menu');
    var show = function(k){
      [].forEach.call(tabs.children, function(b){ b.setAttribute('aria-selected', b.dataset.k===k); });
      $('catTitle').textContent = carte[k].t; $('catText').textContent = carte[k].d;
      menu.innerHTML = carte[k].items.map(function(it, i){
        return '<li><span class="n">'+it[0]+'</span><span class="d">'+it[1]+'</span><span class="p">'+it[2]+' €</span><a class="book-it" href="reserver.html#r-'+k+'-'+i+'">Réserver ce soin →</a></li>';
      }).join('');
      [].forEach.call(menu.children, function(li){ li.addEventListener('click', function(e){ if(e.target.tagName!=='A'){ var o=li.classList.contains('open'); [].forEach.call(menu.children,function(x){x.classList.remove('open')}); if(!o) li.classList.add('open'); } }); });
    };
    keys.forEach(function(k){
      var b=document.createElement('button'); b.type='button'; b.className='tab'; b.setAttribute('role','tab'); b.dataset.k=k; b.textContent=carte[k].t;
      b.addEventListener('click', function(){ show(k); try{ history.replaceState(null,'','#'+k); }catch(e){} });
      tabs.appendChild(b);
    });
    var h = (location.hash||'').slice(1);
    show(carte[h] ? h : 'ongles');
    window.addEventListener('hashchange', function(){ var k=location.hash.slice(1); if(carte[k]) show(k); });
  }

  // Réservation (démo)
  var presta = $('presta');
  if(presta){
    keys.forEach(function(k){
      var og=document.createElement('optgroup'); og.label=carte[k].t;
      carte[k].items.forEach(function(it, i){ var o=document.createElement('option'); o.textContent=it[0]+' · '+it[1]+' · '+it[2]+' €'; o.value=k+'-'+i; o.dataset.name=it[0]; og.appendChild(o); });
      presta.appendChild(og);
    });
    var hm=(location.hash||'').match(/^#r-([a-z]+-\d+)$/);
    if(hm && presta.querySelector('option[value="'+hm[1]+'"]')) presta.value=hm[1];
    var pname=function(){ return presta.options[presta.selectedIndex].dataset.name; };
    var J=['dim','lun','mar','mer','jeu','ven','sam'], M=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    var daysEl=$('days'), slotsEl=$('slots'), recap=$('recap'), sel={day:null,slot:null};
    var heures=['9:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'];
    var d0=new Date(); d0.setHours(0,0,0,0);
    var drawSlots = function(seed){
      slotsEl.innerHTML='';
      heures.forEach(function(h,i){
        var b=document.createElement('button'); b.type='button'; b.className='slot'; b.textContent=h.replace(':','h'); b.setAttribute('aria-pressed','false');
        b.disabled = seed==null || (i*7+seed*3)%5===0;
        b.addEventListener('click', function(){
          [].forEach.call(slotsEl.children, function(x){ x.setAttribute('aria-pressed','false'); });
          b.setAttribute('aria-pressed','true'); sel.slot=b.textContent; upd();
        });
        slotsEl.appendChild(b);
      });
    };
    var label = function(){ return J[sel.day.getDay()]+'. '+sel.day.getDate()+' '+M[sel.day.getMonth()]; };
    var upd = function(){
      if(!sel.day){ recap.textContent='Choisissez un jour et une heure.'; return; }
      if(!sel.slot){ recap.innerHTML='<b>'+label()+'</b> · choisissez une heure.'; return; }
      recap.innerHTML='<b>'+pname()+'</b>, le <b>'+label()+'</b> à <b>'+sel.slot+'</b>.';
    };
    for(var n=1;n<=14;n++){
      (function(n){
        var d=new Date(d0); d.setDate(d0.getDate()+n);
        var b=document.createElement('button'); b.type='button'; b.className='day'; b.setAttribute('aria-pressed','false');
        b.innerHTML='<small>'+J[d.getDay()]+'</small><b>'+d.getDate()+'</b><small>'+M[d.getMonth()]+'</small>';
        b.disabled = d.getDay()===0;
        b.addEventListener('click', function(){
          [].forEach.call(daysEl.children, function(x){ x.setAttribute('aria-pressed','false'); });
          b.setAttribute('aria-pressed','true'); sel.day=d; sel.slot=null; drawSlots(n); upd();
        });
        daysEl.appendChild(b);
      })(n);
    }
    drawSlots(null);
    presta.addEventListener('change', upd);
    var fields=$('bookFields'), done=$('done');
    $('book').addEventListener('submit', function(e){
      e.preventDefault();
      if(!sel.day||!sel.slot){ recap.innerHTML="<b>Il manque le jour ou l'heure.</b> Touchez une date puis un créneau."; return; }
      var nom=$('nom').value.trim();
      $('doneTxt').textContent=(nom?nom+', votre':'Votre')+' demande pour « '+pname()+' », le '+label()+' à '+sel.slot+', est prête.';
      fields.hidden=true; done.hidden=false;
    });
    $('again').addEventListener('click', function(){ done.hidden=true; fields.hidden=false; });
  }

  // Ouvert maintenant ? (lun-sam, 9 h - 19 h)
  document.querySelectorAll('[data-open]').forEach(function(el){
    var now=new Date(), d=now.getDay(), h=now.getHours()+now.getMinutes()/60, txt;
    var open = d>=1 && d<=6 && h>=9 && h<19;
    if(open) txt='<b>Ouvert</b> · ferme à 19 h';
    else if(d>=1 && d<=6 && h<9) txt='<b>Fermé</b> · ouvre à 9 h';
    else txt='<b>Fermé</b> · ouvre '+((d===6||d===0)?'lundi':'demain')+' à 9 h';
    el.classList.toggle('closed', !open);
    el.querySelector('span').innerHTML=txt;
  });

  // Quiz « Quel soin pour vous ? »
  var quiz=$('quiz');
  if(quiz){
    var Q1=[['ongles','Des mains impeccables','✦'],['cils','Un regard qui pétille','◉'],['massages','Décrocher et me détendre','~'],['soins','Une peau éclatante','❀'],['maquillage','Être belle pour un événement','♡']];
    var Q2=[[30,'30 minutes, entre deux choses','½'],[60,'Une petite heure','1'],[120,'Je prends tout mon temps','∞']];
    var mins=function(s){ var m=s.match(/(\d+)\s*h(?:\s*(\d+))?/); if(m) return (+m[1])*60+(+(m[2]||0)); return parseInt(s,10)||0; };
    var ans={};
    var dots=function(n){ return '<div class="q-dots" aria-hidden="true"><span class="'+(n>=1?'on':'')+'"></span><span class="'+(n>=2?'on':'')+'"></span><span class="'+(n>=3?'on':'')+'"></span></div>'; };
    var opts=function(list){ return '<div class="q-opts">'+list.map(function(o){ return '<button type="button" class="q-opt" data-v="'+o[0]+'"><span class="ic">'+o[2]+'</span>'+o[1]+'</button>'; }).join('')+'</div>'; };
    var step1=function(){
      quiz.innerHTML=dots(1)+'<p class="q-title">Aujourd’hui, vous avez envie de…</p>'+opts(Q1);
      quiz.querySelectorAll('.q-opt').forEach(function(b){ b.addEventListener('click', function(){ ans.cat=b.dataset.v; step2(); }); });
    };
    var step2=function(){
      quiz.innerHTML=dots(2)+'<p class="q-title">Combien de temps pour vous ?</p>'+opts(Q2)+'<button type="button" class="q-back" id="qb">← Revenir</button>';
      quiz.querySelectorAll('.q-opt').forEach(function(b){ b.addEventListener('click', function(){ ans.t=+b.dataset.v; result(); }); });
      $('qb').addEventListener('click', step1);
    };
    var result=function(){
      var all=carte[ans.cat].items, best=-1, bd=1e9;
      all.forEach(function(it,i){ if(it[2]<=12) return; var dd=Math.abs(mins(it[1])-ans.t); if(dd<bd){ bd=dd; best=i; } });
      var it=all[best];
      quiz.innerHTML=dots(3)+'<div class="q-res"><p class="eyebrow">Notre suggestion</p><p class="name">'+it[0]+'</p><p class="meta">'+it[1]+' · '+it[2]+' € · '+carte[ans.cat].d+'</p><div class="row"><a class="btn btn-rose" href="reserver.html#r-'+ans.cat+'-'+best+'">Réserver ce soin</a><a class="btn btn-ghost" href="prestations.html#'+ans.cat+'">Toute la carte</a></div></div><button type="button" class="q-back" id="qb">Recommencer</button>';
      $('qb').addEventListener('click', function(){ ans={}; step1(); });
    };
    step1();
  }

  // Galerie plein écran
  var figs=[].slice.call(document.querySelectorAll('figure[data-src]'));
  if(figs.length){
    var lb=document.createElement('div'); lb.className='lb'; lb.hidden=true;
    lb.setAttribute('role','dialog'); lb.setAttribute('aria-modal','true'); lb.setAttribute('aria-label','Galerie');
    lb.innerHTML='<div class="lb-top"><span id="lbN"></span><button class="lb-btn" type="button" id="lbX" aria-label="Fermer">✕</button></div><div class="lb-stage" id="lbS"></div><div class="lb-foot"><button class="lb-btn" type="button" id="lbP" aria-label="Photo précédente">←</button><p id="lbC"></p><button class="lb-btn" type="button" id="lbNx" aria-label="Photo suivante">→</button></div>';
    document.body.appendChild(lb);
    var cur=0, last=null;
    var draw=function(){ var f=figs[cur]; $('lbS').innerHTML='<img src="'+f.dataset.src+'" alt="'+f.dataset.t+'">'; $('lbC').innerHTML=f.dataset.t+'<small>'+f.dataset.c+'</small>'; $('lbN').textContent=(cur+1)+' / '+figs.length; };
    var openLb=function(i){ cur=i; last=document.activeElement; draw(); lb.hidden=false; document.body.classList.add('locked'); $('lbX').focus(); };
    var closeLb=function(){ lb.hidden=true; document.body.classList.remove('locked'); if(last) last.focus(); };
    var go=function(n){ cur=(cur+n+figs.length)%figs.length; draw(); };
    figs.forEach(function(f,i){ f.querySelector('.ph-btn').addEventListener('click', function(){ openLb(i); }); });
    $('lbX').addEventListener('click', closeLb);
    $('lbP').addEventListener('click', function(){ go(-1); });
    $('lbNx').addEventListener('click', function(){ go(1); });
    lb.addEventListener('click', function(e){ if(e.target===lb || e.target.id==='lbS') closeLb(); });
    document.addEventListener('keydown', function(e){ if(lb.hidden) return; if(e.key==='Escape') closeLb(); if(e.key==='ArrowLeft') go(-1); if(e.key==='ArrowRight') go(1); });
    var x0=null;
    $('lbS').addEventListener('touchstart', function(e){ x0=e.touches[0].clientX; }, {passive:true});
    $('lbS').addEventListener('touchend', function(e){ if(x0==null) return; var dx=e.changedTouches[0].clientX-x0; if(Math.abs(dx)>40) go(dx<0?1:-1); x0=null; });
  }
})();
