import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function auditStyles(page, screen) {
  return page.evaluate(screen => {
    const allowed = [12,13,15,17,20,22,28,34,48,64,88];
    const probe = document.createElement('div'); probe.style.background = 'var(--card)'; document.body.append(probe);
    const cardColor = getComputedStyle(probe).backgroundColor; probe.remove();
    const violations = [], sizes = new Set(), weights = new Set(), radii = new Set();
    let targets = 0;
    const describe = el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0,90)} ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0,50)}`;
    const dialog = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(e => e.getBoundingClientRect().width).at(-1);
    for (const el of (dialog ?? document).querySelectorAll('*')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.tagName !== 'STYLE' && !el.closest('svg')) {
        const size = parseFloat(cs.fontSize), weight = +cs.fontWeight;
        sizes.add(size); weights.add(weight);
        if (!allowed.some(n => Math.abs(size-n)<.1)) violations.push({rule:'font-size',value:size,el:describe(el)});
        if (![400,600,700].includes(weight) || weight === 700 && size < 22) violations.push({rule:'font-weight',value:weight,el:describe(el)});
      }
      if (el.matches('button,a[href],summary,input:not([type="hidden"]),select,textarea,[role="button"]') && !el.closest('[inert]')) {
        targets++;
        if (r.width < 43.5 || r.height < 43.5) violations.push({rule:'tap-target',value:[Math.round(r.width),Math.round(r.height)],el:describe(el)});
      }
      if (!el.closest('[role="switch"]') && !/_(me|tutor)_/.test(String(el.className)) && cs.backgroundColor === cardColor && (cs.boxShadow !== 'none' || /_(card|rc|materialCard|courseCard|unitCard|ruleCard|topicsCard|resultList|courseUnitsCard)_/.test(String(el.className)))) {
        const radius = parseFloat(cs.borderTopLeftRadius); radii.add(radius);
        if (radius > 0 && ![14,20].includes(radius)) violations.push({rule:'card-radius',value:radius,el:describe(el)});
      }
    }
    return {screen,width:innerWidth,dark:document.body.classList.contains('dark'),sizes:[...sizes],weights:[...weights],radii:[...radii],targets,violations};
  }, screen);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const oi = args.indexOf('--out'); const out = oi >= 0 ? args[oi+1] : 'artifacts/style-audit';
  if (oi >= 0) args.splice(oi,2);
  fs.mkdirSync(out,{recursive:true});
  const result = spawnSync(process.execPath,['--import','tsx','tests/browser/capture.mjs','--out',out,'--widths','390,1440','--themes','light,dark',...args],{env:{...process.env,LAWSTIN_STYLE_AUDIT:'1'},stdio:'inherit'});
  process.exitCode = result.status ?? 1;
}
