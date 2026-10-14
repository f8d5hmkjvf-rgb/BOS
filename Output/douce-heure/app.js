(function(){
  var $ = function(id){ return document.getElementById(id); };

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
      menu.innerHTML = carte[k].items.map(function(it){
        return '<li><span class="n">'+it[0]+'</span><span class="d">'+it[1]+'</span><span class="p">'+it[2]+' €</span></li>';
      }).join('');
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
      carte[k].items.forEach(function(it){ var o=document.createElement('option'); o.textContent=it[0]+' · '+it[1]+' · '+it[2]+' €'; o.value=it[0]; og.appendChild(o); });
      presta.appendChild(og);
    });
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
      recap.innerHTML='<b>'+presta.value+'</b>, le <b>'+label()+'</b> à <b>'+sel.slot+'</b>.';
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
      $('doneTxt').textContent=(nom?nom+', votre':'Votre')+' demande pour « '+presta.value+' », le '+label()+' à '+sel.slot+', est prête.';
      fields.hidden=true; done.hidden=false;
    });
    $('again').addEventListener('click', function(){ done.hidden=true; fields.hidden=false; });
  }
})();
