  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function stripUndefined(obj){ return JSON.parse(JSON.stringify(obj)); }
  function setStatus(badgeId, state, label){
    const badge = document.getElementById(badgeId);
    if(!badge) return;
    badge.className = 'status-badge ' + state;
    badge.textContent = label;
  }

  /* ==========================================================================
     LIGHTWEIGHT CODE SYNTAX HIGHLIGHTING (no external library)
     Line numbers + token coloring for HL7 v2 and JSON, rendered as
     <div class="hd-code-lines"> + <pre class="hd-code-content">.
     ========================================================================== */
  function codeBlockHTML(lineHtmlArray){
    const nums = lineHtmlArray.map((_, i) => `<div>${i + 1}</div>`).join('');
    const content = lineHtmlArray.map(h => `<span class="cline">${h || ''}</span>`).join('');
    return `<div class="hd-code-lines">${nums}</div><pre class="hd-code-content">${content}</pre>`;
  }
  function highlightHL7Line(line){
    if(!line) return '';
    const parts = line.split('|');
    return parts.map((part, i) => {
      const escaped = escapeHtml(part).replace(/\^/g, '<span class="tok-caret">^</span>');
      return i === 0 ? `<span class="tok-seg">${escaped}</span>` : `<span class="tok-field">${escaped}</span>`;
    }).join('<span class="tok-pipe">|</span>');
  }
  function highlightJSONString(jsonText){
    const escaped = escapeHtml(jsonText);
    return escaped.replace(
      /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'tok-number';
        if(/^&quot;/.test(match)) cls = /:$/.test(match) ? 'tok-key' : 'tok-string';
        else if(match === 'true' || match === 'false') cls = 'tok-bool';
        else if(match === 'null') cls = 'tok-null';
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }
  function renderHL7Code(container, text){
    if(!container) return;
    container.classList.remove('empty-state');
    container.innerHTML = codeBlockHTML(text.split(/\r\n|\r|\n/).map(highlightHL7Line));
  }
  function renderJSONCode(container, jsonText){
    if(!container) return;
    container.classList.remove('empty-state');
    container.innerHTML = codeBlockHTML(highlightJSONString(jsonText).split('\n'));
  }

  /* ==========================================================================
     HERO SUITE TABS
     ========================================================================== */
  let heroViewerRan = false;
  let heroValidatorRan = false;
  function showHeroTool(i){
    document.querySelectorAll('.hd-tab').forEach((b, idx) => {
      b.classList.toggle('active', idx === i);
      b.setAttribute('aria-selected', idx === i ? 'true' : 'false');
    });
    document.querySelectorAll('.hd-panel').forEach((p, idx) => p.classList.toggle('active', idx === i));
    if(i === 1 && !heroViewerRan){ heroViewerRan = true; renderHeroViewer(); }
    if(i === 2 && !heroValidatorRan){ heroValidatorRan = true; renderHeroValidator(); }
  }

  /* ==========================================================================
     TAB 0 — HL7 to FHIR Converter (frontend demonstration, no live API call)
     ========================================================================== */
  const SAMPLE_HL7 = [
    'MSH|^~\\&|SENDING_APP|SENDING_FACILITY|RECEIVING_APP|RECEIVING_FACILITY|20250522120000||ADT^A01|MSGID12345|P|2.5.1|||AL|NE|USA',
    'EVN|A01|20250522115900|||20250522120000',
    'PID|1||1234^1^1^^^ACUTE^01||||DOE^JOHN^^^^||||19800101|M|',
    'PV1|1|I|1234^1^1^^^ACUTE^01||||1234^ATTENDING^^^^^^',
    'ORC|NW|ORD12345|||CM|||20250522115900',
    'OBR|1|ORD12345|TEST123^COMPLETE BLOOD COUNT^L||||',
    'OBX|1|NM|WBC^WHITE BLOOD CELL COUNT^L||6.5|10*3/uL|4.0-11.0||||F',
    'OBX|2|NM|RBC^RED BLOOD CELL COUNT^L||4.50|10*6/uL|4.20-5.40||||F'
  ].join('\n');

  // Curated bundle shown for the untouched sample message — mirrors the demo pair exactly.
  const HERO_FHIR_SAMPLE = {
    resourceType: 'Bundle',
    type: 'transaction',
    timestamp: '2025-05-22T12:00:00Z',
    entry: [
      { fullUrl: 'urn:uuid:a53f2c10-0001-4b1e-9c2a-000000000001', resource: { resourceType: 'Patient', id: 'patient-1', identifier: [{ system: 'http://example.org/mrn', value: '123456' }], name: [{ use: 'official', family: 'DOE', given: ['JOHN'] }], gender: 'male', birthDate: '1980-01-01' } },
      { fullUrl: 'urn:uuid:a53f2c10-0001-4b1e-9c2a-000000000002', resource: { resourceType: 'Observation', id: 'obs-wbc', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '6690-2', display: 'White blood cell count' }] }, subject: { reference: 'Patient/patient-1' }, valueQuantity: { value: 6.5, unit: '10*3/uL' } } },
      { fullUrl: 'urn:uuid:a53f2c10-0001-4b1e-9c2a-000000000003', resource: { resourceType: 'Observation', id: 'obs-rbc', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '789-8', display: 'Red blood cell count' }] }, subject: { reference: 'Patient/patient-1' }, valueQuantity: { value: 4.50, unit: '10*6/uL' } } }
    ]
  };

  // Best-effort generic parser used only when the visitor edits the input away from the sample.
  function parseHL7ToFHIR(rawText){
    const lines = rawText.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
    let patient = null;
    const observations = [];
    let msgType = null;
    lines.forEach(line => {
      const fields = line.split('|');
      const seg = (fields[0] || '').toUpperCase();
      if(seg === 'MSH'){
        msgType = fields[8] || null;
      } else if(seg === 'PID'){
        const idComp = (fields[3] || '').split('^');
        const nameComp = (fields[5] || '').split('^');
        const dobRaw = fields[7] || '';
        const dob = dobRaw.length >= 8 ? `${dobRaw.slice(0,4)}-${dobRaw.slice(4,6)}-${dobRaw.slice(6,8)}` : undefined;
        const genderMap = { M:'male', F:'female', O:'other', U:'unknown' };
        patient = {
          resourceType: 'Patient',
          id: idComp[0] || 'unknown',
          identifier: idComp[0] ? [{ system: 'urn:hgear:demo:mrn', value: idComp[0] }] : undefined,
          name: nameComp[0] ? [{ family: nameComp[0], given: nameComp[1] ? [nameComp[1]] : undefined }] : undefined,
          gender: genderMap[(fields[8] || '').toUpperCase()],
          birthDate: dob
        };
      } else if(seg === 'OBX'){
        const codeComp = (fields[3] || '').split('^');
        const value = fields[5];
        const unit = fields[6];
        observations.push({
          resourceType: 'Observation',
          id: `obs-${observations.length + 1}-${(codeComp[0] || 'unknown').replace(/[^a-zA-Z0-9-]/g,'')}`,
          status: 'final',
          code: codeComp[0] ? { coding: [{ system: 'http://loinc.org', code: codeComp[0], display: codeComp[1] || undefined }] } : undefined,
          subject: patient ? { reference: `Patient/${patient.id}` } : undefined,
          valueQuantity: value ? { value: isNaN(Number(value)) ? undefined : Number(value), unit: unit || undefined } : undefined
        });
      }
    });
    if(!patient && observations.length === 0){
      return { error: 'No recognizable HL7 segments found. Include an MSH, PID, and/or OBX segment, pipe-delimited.' };
    }
    const entry = [];
    if(patient) entry.push({ resource: stripUndefined(patient) });
    observations.forEach(o => entry.push({ resource: stripUndefined(o) }));
    return { bundle: { resourceType: 'Bundle', type: 'transaction', meta: { source: 'hgear-demo-converter' }, entry }, messageType: msgType };
  }

  let heroHL7Text = SAMPLE_HL7;
  let heroEditMode = false;
  let heroFhirOutputText = '';
  let heroConverting = false;

  function refreshHeroHL7View(){ renderHL7Code(document.getElementById('hd-hl7-code'), heroHL7Text); }

  function toggleHeroEditMode(){
    const codeView = document.getElementById('hd-hl7-code');
    const textarea = document.getElementById('hd-hl7-input');
    const btn = document.getElementById('hd-hl7-edit-btn');
    if(!codeView || !textarea || !btn) return;
    heroEditMode = !heroEditMode;
    if(heroEditMode){
      textarea.value = heroHL7Text;
      codeView.style.display = 'none';
      textarea.style.display = 'block';
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'Done editing';
      textarea.focus();
    } else {
      heroHL7Text = textarea.value;
      codeView.style.display = '';
      textarea.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = 'Edit &middot; &#8942;';
      refreshHeroHL7View();
    }
  }
  function getHeroHL7Source(){
    if(heroEditMode){
      const ta = document.getElementById('hd-hl7-input');
      if(ta) heroHL7Text = ta.value;
    }
    return heroHL7Text;
  }

  const HERO_STAGE_LABELS = ['Converting…', 'Transforming HL7 v2…', 'Mapping FHIR resources…'];

  function runHeroConversion(){
    if(heroConverting) return;
    const sourceText = getHeroHL7Source();
    const btn = document.getElementById('hd-convert-btn');
    const statusEl = document.getElementById('hd-convert-status');
    const pill = document.getElementById('hd-status-pill');
    const arrowWrap = document.getElementById('hd-arrow-wrap');
    const fhirChip = document.getElementById('hd-fhir-chip');
    const fhirDot = document.getElementById('hd-fhir-dot');
    const outEl = document.getElementById('hd-fhir-code');
    const flowFill = document.getElementById('hd-flow-fill');
    if(!btn || !statusEl || !pill || !arrowWrap || !fhirChip || !fhirDot || !outEl) return;

    heroConverting = true;
    btn.disabled = true;
    arrowWrap.classList.add('busy');
    statusEl.classList.remove('done');
    statusEl.classList.add('busy');
    pill.className = 'hd-status-pill pending';
    pill.textContent = 'Processing';
    if(flowFill){ flowFill.classList.remove('done'); flowFill.style.width = '12%'; }

    const finish = () => {
      let bundleObj;
      if(sourceText.trim() === SAMPLE_HL7.trim()){
        bundleObj = HERO_FHIR_SAMPLE;
      } else {
        const result = parseHL7ToFHIR(sourceText);
        if(result.error){
          outEl.classList.add('empty-state');
          outEl.textContent = result.error;
          statusEl.textContent = 'Error';
          statusEl.classList.remove('busy');
          pill.className = 'hd-status-pill fail';
          pill.textContent = '400 Bad Input';
          arrowWrap.classList.remove('busy');
          btn.disabled = false;
          heroConverting = false;
          if(flowFill){ flowFill.style.width = '0%'; flowFill.classList.add('done'); }
          return;
        }
        bundleObj = result.bundle;
      }
      heroFhirOutputText = JSON.stringify(bundleObj, null, 2);
      if(flowFill) flowFill.style.width = '100%';
      renderJSONCode(outEl, heroFhirOutputText);
      fhirChip.classList.add('lit');
      fhirDot.classList.remove('muted');
      statusEl.textContent = 'FHIR R4 generated';
      statusEl.classList.remove('busy');
      statusEl.classList.add('done');
      pill.className = 'hd-status-pill ok';
      pill.textContent = '200 OK ✓';
      arrowWrap.classList.remove('busy');
      btn.disabled = false;
      heroConverting = false;
      if(flowFill){
        setTimeout(() => { flowFill.classList.add('done'); }, 500);
        setTimeout(() => { flowFill.style.width = '0%'; flowFill.classList.remove('done'); }, 1100);
      }
    };

    if(prefersReducedMotion){ finish(); return; }

    let i = 0;
    const stepDelay = 420;
    const fillSteps = [12, 38, 68, 88];
    const tick = () => {
      if(i < HERO_STAGE_LABELS.length){
        statusEl.textContent = HERO_STAGE_LABELS[i];
        if(flowFill) flowFill.style.width = fillSteps[i + 1] + '%';
        i++;
        setTimeout(tick, stepDelay);
      } else {
        finish();
      }
    };
    tick();
  }

  function copyHeroCode(which){
    const sources = { hl7: () => getHeroHL7Source(), fhir: () => heroFhirOutputText };
    const btnIds = { hl7: 'hd-hl7-copy-btn', fhir: 'hd-fhir-copy-btn' };
    const getText = sources[which];
    if(!getText) return;
    const text = getText();
    if(!text) return;
    const btn = document.getElementById(btnIds[which]);
    const done = () => {
      if(!btn) return;
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1400);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      done();
    }
  }
  function downloadHeroOutput(){
    if(!heroFhirOutputText) return;
    const blob = new Blob([heroFhirOutputText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'hgear-fhir-bundle.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ==========================================================================
     TAB 1 — FHIR Viewer (paste your own bundle, or browse the sample)
     ========================================================================== */
  const SAMPLE_FHIR_BUNDLE = JSON.stringify({
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      { resource: { resourceType: 'Patient', id: 'patient-1', identifier: [{ system: 'http://example.org/mrn', value: '123456' }], name: [{ use: 'official', family: 'DOE', given: ['JOHN'] }], gender: 'male', birthDate: '1980-01-01' } },
      { resource: { resourceType: 'Encounter', id: 'encounter-1', status: 'finished', class: { code: 'AMB', display: 'ambulatory' }, subject: { reference: 'Patient/patient-1' }, period: { start: '2025-05-22T12:00:00Z', end: '2025-05-22T12:45:00Z' } } },
      { resource: { resourceType: 'Observation', id: 'obs-wbc', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '6690-2', display: 'White blood cell count' }] }, subject: { reference: 'Patient/patient-1' }, encounter: { reference: 'Encounter/encounter-1' }, valueQuantity: { value: 6.5, unit: '10*3/uL' } } },
      { resource: { resourceType: 'Observation', id: 'obs-rbc', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '789-8', display: 'Red blood cell count' }] }, subject: { reference: 'Patient/patient-1' }, encounter: { reference: 'Encounter/encounter-1' }, valueQuantity: { value: 4.50, unit: '10*6/uL' } } },
      { resource: { resourceType: 'Condition', id: 'cond-1', clinicalStatus: { coding: [{ code: 'active' }] }, code: { text: 'Essential hypertension' }, subject: { reference: 'Patient/patient-1' } } },
      { resource: { resourceType: 'MedicationRequest', id: 'medreq-1', status: 'active', intent: 'order', medicationCodeableConcept: { text: 'Lisinopril 10mg tablet' }, subject: { reference: 'Patient/patient-1' } } },
      { resource: { resourceType: 'DiagnosticReport', id: 'diag-1', status: 'final', code: { text: 'Complete Blood Count' }, subject: { reference: 'Patient/patient-1' }, result: [{ reference: 'Observation/obs-wbc' }, { reference: 'Observation/obs-rbc' }] } }
    ]
  }, null, 2);

  const VIEWER_TYPE_ORDER = ['Patient','Encounter','Observation','Condition','MedicationRequest','DiagnosticReport'];
  let heroViewerResources = [];

  function loadSampleFhir(autoRun){
    const el = document.getElementById('fhir-input');
    if(el) el.value = SAMPLE_FHIR_BUNDLE;
    if(autoRun) renderHeroViewer();
  }
  function toggleFhirEditor(){
    const ta = document.getElementById('fhir-input');
    const btn = document.getElementById('hd-fhir-editor-toggle');
    if(!ta || !btn) return;
    const show = ta.style.display === 'none';
    ta.style.display = show ? 'block' : 'none';
    btn.textContent = show ? 'Hide JSON' : 'Edit JSON';
    if(!show) renderHeroViewer();
  }

  function fieldRows(res){
    const rows = [];
    rows.push(['Resource type', res.resourceType || '—']);
    rows.push(['ID', res.id || '—']);
    if(Array.isArray(res.identifier) && res.identifier[0]) rows.push(['Identifier', res.identifier[0].value || '—']);
    if(res.name && res.name[0]){
      const n = res.name[0];
      rows.push(['Name', [ (n.given || []).join(' '), n.family ].filter(Boolean).join(' ') || '—']);
    }
    if(res.birthDate) rows.push(['DOB', res.birthDate]);
    if(res.gender) rows.push(['Gender', res.gender.charAt(0).toUpperCase() + res.gender.slice(1)]);
    if(res.status) rows.push(['Status', res.status]);
    if(res.class && res.class.display) rows.push(['Class', res.class.display]);
    if(res.code){
      const label = (res.code.coding && res.code.coding[0] && (res.code.coding[0].display || res.code.coding[0].code)) || res.code.text;
      if(label) rows.push(['Code', label]);
    }
    if(res.medicationCodeableConcept && res.medicationCodeableConcept.text) rows.push(['Medication', res.medicationCodeableConcept.text]);
    if(res.valueQuantity) rows.push(['Value', `${res.valueQuantity.value} ${res.valueQuantity.unit || ''}`.trim()]);
    if(res.subject && res.subject.reference) rows.push(['Subject', res.subject.reference]);
    return rows;
  }

  function renderViewerDetail(type){
    const fieldsEl = document.getElementById('hd-viewer-fields');
    const jsonEl = document.getElementById('hd-viewer-json');
    const selectedEl = document.getElementById('hd-viewer-selected');
    const res = heroViewerResources.find(r => r.resourceType === type);
    if(!res || !fieldsEl || !jsonEl) return;
    fieldsEl.innerHTML = fieldRows(res).map(([label, value]) => `
      <div class="hd-field-row"><span class="hd-field-label">${escapeHtml(label)}</span><span class="hd-field-value">${escapeHtml(String(value))}</span></div>
    `).join('');
    renderJSONCode(jsonEl, JSON.stringify(res, null, 2));
    if(selectedEl){
      selectedEl.innerHTML = `Showing <strong>${escapeHtml(type)}</strong> <span class="hd-viewer-selected-arrow">&rarr;</span> fields on the left, raw JSON on the right`;
    }
  }
  function selectViewerType(type, btnEl){
    document.querySelectorAll('.hd-viewer-item').forEach(b => {
      b.classList.toggle('active', b === btnEl);
      b.setAttribute('aria-selected', b === btnEl ? 'true' : 'false');
    });
    renderViewerDetail(type);
  }

  function renderHeroViewer(){
    const input = document.getElementById('fhir-input');
    const navEl = document.getElementById('hd-viewer-nav');
    const fieldsEl = document.getElementById('hd-viewer-fields');
    const jsonEl = document.getElementById('hd-viewer-json');
    if(!input || !navEl || !fieldsEl || !jsonEl) return;
    if(!input.value.trim()) input.value = SAMPLE_FHIR_BUNDLE;

    let resources = [];
    try{
      const data = JSON.parse(input.value);
      if(data.resourceType === 'Bundle' && Array.isArray(data.entry)){
        resources = data.entry.map(e => e.resource).filter(Boolean);
      } else if(data.resourceType){
        resources = [data];
      } else {
        throw new Error('No resourceType found');
      }
      if(resources.length === 0) throw new Error('Bundle has no entries');
    } catch(e){
      navEl.innerHTML = '';
      fieldsEl.innerHTML = `<p class="dash-error" style="padding:14px 0;">Could not parse input: ${escapeHtml(e.message)}. Paste a valid FHIR resource or Bundle.</p>`;
      jsonEl.className = 'hd-code empty-state';
      jsonEl.textContent = 'No output yet.';
      return;
    }

    heroViewerResources = resources;
    const presentTypes = VIEWER_TYPE_ORDER.filter(t => resources.some(r => r.resourceType === t));
    resources.forEach(r => { if(r.resourceType && presentTypes.indexOf(r.resourceType) === -1) presentTypes.push(r.resourceType); });

    navEl.innerHTML = presentTypes.map((t, idx) =>
      `<button type="button" class="hd-viewer-item${idx === 0 ? ' active' : ''}" role="tab" aria-selected="${idx === 0}" onclick="selectViewerType('${t}', this)">${escapeHtml(t)}</button>`
    ).join('');

    if(presentTypes.length){
      renderViewerDetail(presentTypes[0]);
    } else {
      fieldsEl.innerHTML = '<p style="padding:14px 0; font-size:13px; color:var(--text-muted);">No typed resources found.</p>';
      jsonEl.className = 'hd-code empty-state';
      jsonEl.textContent = 'No output yet.';
    }
  }

  /* ==========================================================================
     TAB 2 — NCQA Validator (demo structural checks, not a real submission)
     ========================================================================== */
  const SAMPLE_VALIDATOR_INPUT = JSON.stringify({
    resourceType: 'Patient',
    id: 'patient-1',
    identifier: [{ system: 'http://example.org/mrn', value: '123456' }],
    name: [{ use: 'official', family: 'DOE', given: ['JOHN'] }],
    gender: 'male',
    birthDate: '1980-01-01'
  }, null, 2);

  function loadSampleValidator(autoRun){
    const el = document.getElementById('ncqa-input');
    if(el) el.value = SAMPLE_VALIDATOR_INPUT;
    if(autoRun) renderHeroValidator();
  }
  function toggleValidatorEditor(){
    const ta = document.getElementById('ncqa-input');
    const btn = document.getElementById('hd-validator-editor-toggle');
    if(!ta || !btn) return;
    const show = ta.style.display === 'none';
    ta.style.display = show ? 'block' : 'none';
    btn.textContent = show ? 'Hide JSON' : 'Edit JSON';
    if(!show) renderHeroValidator();
  }

  function runNcqaChecks(resource){
    const checks = [];
    checks.push({ label: 'Resource structure', detail: 'Valid FHIR R4 JSON with a declared resourceType.', status: resource.resourceType ? 'pass' : 'fail' });
    const isPatient = resource.resourceType === 'Patient';
    const isBundle = resource.resourceType === 'Bundle';
    if(isBundle){
      const entries = Array.isArray(resource.entry) ? resource.entry : [];
      checks.push({ label: 'Required fields', detail: 'Bundle contains at least one entry.', status: entries.length > 0 ? 'pass' : 'fail' });
      checks.push({ label: 'Data types', detail: 'Every entry has a resource with a resourceType.', status: (entries.length > 0 && entries.every(e => e.resource && e.resource.resourceType)) ? 'pass' : 'fail' });
    } else {
      const hasId = Array.isArray(resource.identifier) && resource.identifier.length > 0;
      checks.push({ label: 'Required fields', detail: 'Has at least one identifier, such as an MRN.', status: hasId ? 'pass' : 'fail' });
      if(isPatient){
        checks.push({ label: 'Data types', detail: 'birthDate matches the FHIR date type; gender matches the value set.', status: (resource.birthDate && resource.gender) ? 'pass' : 'fail' });
        const demoSystem = hasId && /example\.org|hgear:demo/i.test(resource.identifier[0].system || '');
        checks.push({ label: 'Coding systems', detail: demoSystem ? 'identifier.system uses a demo URI, not a registered OID or CLIA number.' : 'identifier.system looks like a real coding system URI.', status: demoSystem ? 'warn' : 'pass' });
        const hasName = Array.isArray(resource.name) && resource.name.length > 0;
        checks.push({ label: 'FHIR profile', detail: 'Conforms to the shape of the US Core Patient profile.', status: hasName ? 'pass' : 'fail' });
        checks.push({ label: 'Required elements', detail: 'name, gender, and birthDate are present for NCQA data-aggregator style checks.', status: (hasName && resource.gender && resource.birthDate) ? 'pass' : 'fail' });
      }
    }
    return checks;
  }

  function renderHeroValidator(){
    const input = document.getElementById('ncqa-input');
    const resultEl = document.getElementById('hd-validator-result');
    if(!input || !resultEl) return;
    if(!input.value.trim()) input.value = SAMPLE_VALIDATOR_INPUT;
    let resource;
    try{
      resource = JSON.parse(input.value);
      if(!resource || typeof resource !== 'object') throw new Error('Input is not a JSON object');
    } catch(e){
      resultEl.innerHTML = `<p class="dash-error">Could not parse input: ${escapeHtml(e.message)}. Paste a valid FHIR resource.</p>`;
      return;
    }
    const checks = runNcqaChecks(resource);
    const passed = checks.filter(c => c.status === 'pass').length;
    const hasFail = checks.some(c => c.status === 'fail');
    const pct = Math.round((passed / checks.length) * 100);
    const icon = { pass: '✓', warn: '⚠', fail: '✕' };
    resultEl.innerHTML = `
      <div class="hd-validate-head">
        <div class="hd-validate-title">
          <span class="status-badge ${hasFail ? 'fail' : 'ok'}">${hasFail ? 'Validation issues found' : 'Validation complete'}</span>
          <span class="hd-validate-caption">Demo structural checks against US Core and NCQA style rules.</span>
        </div>
      </div>
      <div class="validator-score">
        <div class="validator-score-ring" style="--pct:${pct};"><div class="validator-score-ring-inner">${hasFail ? pct + '%' : 'Valid'}</div></div>
        <div>
          <div style="font-weight:700; font-size:14px;">${passed} of ${checks.length} checks passed</div>
          <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(resource.resourceType || 'Resource')} &middot; US Core profile</div>
        </div>
      </div>
      <div>
        ${checks.map(c => `
          <div class="validator-check-row">
            <span class="validator-check-icon ${c.status}">${icon[c.status]}</span>
            <div class="validator-check-text"><strong>${escapeHtml(c.label)}</strong><span>${escapeHtml(c.detail)}</span></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // seed hidden editors + paint the default HL7 pane, then auto-play the conversion once
  // so a first-time visitor sees the product working without needing to click anything
  loadSampleFhir(false);
  loadSampleValidator(false);
  refreshHeroHL7View();
  setTimeout(runHeroConversion, prefersReducedMotion ? 250 : 1100);

  // ---- FAQ accordion ----
  function toggleFaq(btn){
    const item = btn.closest('.faq-item');
    const open = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // ---- Suite showcase (master-detail product switcher) ----
  function showSuiteProduct(i){
    document.querySelectorAll('.suite-nav-item').forEach((b, idx) => {
      b.classList.toggle('active', idx === i);
      b.setAttribute('aria-selected', idx === i ? 'true' : 'false');
    });
    document.querySelectorAll('.suite-panel-content').forEach((p, idx) => p.classList.toggle('active', idx === i));
  }

  // ---- Persona tabs (crossfade + slide) ----
  function showTab(i){
    document.querySelectorAll('.tab-btn').forEach((b,idx)=>b.classList.toggle('active', idx===i));
    document.querySelectorAll('.tab-panel').forEach((p,idx)=>{
      if(idx===i){
        p.style.display = 'block';
        p.classList.remove('active');
        void p.offsetWidth; // force reflow so the transition re-triggers
        p.classList.add('active');
      } else {
        p.classList.remove('active');
        p.style.display = 'none';
      }
    });
  }

  // ---- How it works stepper ----
  const stepperData = [
    {num:'01', title:'Pick a tool', desc:"Choose the converter, validator, or viewer that matches what you're working with."},
    {num:'02', title:'Upload or paste your data', desc:'Drop in an HL7 v2 message, a C-CDA document, or a FHIR resource. Use synthetic or de-identified data only.'},
    {num:'03', title:'Run it', desc:'Convert, validate, or view the output immediately in your browser.'},
    {num:'04', title:'Export or connect', desc:"Download the result, or call the same function through the API once you're ready for a pipeline."}
  ];
  const stepperCard = document.querySelector('.stepper-card');
  if(stepperCard) stepperCard.style.transition = 'opacity .35s ease';

  function applyStep(i){
    document.getElementById('stepper-num').textContent = stepperData[i].num;
    document.getElementById('stepper-title').textContent = stepperData[i].title;
    document.getElementById('stepper-desc').textContent = stepperData[i].desc;
    const fill = document.getElementById('stepper-line-fill');
    if(fill) fill.style.height = (((i + 1) / stepperData.length) * 100) + '%';
    document.querySelectorAll('.stepper-visual-panel').forEach(p => {
      p.classList.toggle('active', Number(p.dataset.step) === i);
    });
  }
  function showStep(i, isManual){
    document.querySelectorAll('.stepper-tab').forEach((b,idx)=>b.classList.toggle('active', idx===i));
    if(stepperCard && !prefersReducedMotion){
      stepperCard.style.opacity = '0';
      setTimeout(()=>{ applyStep(i); stepperCard.style.opacity = '1'; }, 180);
    } else {
      applyStep(i);
    }
    currentStep = i;
    if(isManual) restartStepperCycle();
  }

  let currentStep = 0;
  let stepperInterval = null;

  function startStepperCycle(){
    if(prefersReducedMotion) return;
    stepperInterval = setInterval(()=>{
      showStep((currentStep + 1) % stepperData.length);
    }, 4000);
  }
  function restartStepperCycle(){
    if(stepperInterval) clearInterval(stepperInterval);
    startStepperCycle();
  }
  startStepperCycle();

  // ---- Scroll-reveal system ----
  const revealEls = document.querySelectorAll('.reveal, .reveal-scale');
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold:.15, rootMargin:'0px 0px -8% 0px' });
    revealEls.forEach(el=>io.observe(el));
  } else {
    revealEls.forEach(el=>el.classList.add('in'));
  }

  // ---- Desktop nav: active-section indicator ----
  // Single source of truth: exactly one nav link (the first one in DOM order
  // whose href matches the current section) ever carries .active, even when
  // multiple links legitimately point to the same section (e.g. "FHIR Viewer"
  // and "FHIR Transformers" both link to #tools).
  if('IntersectionObserver' in window){
    const navSectionIds = ['tools', 'fusion', 'faq'];
    const allNavLinks = [...document.querySelectorAll('.navlinks a')];
    const activeSectionIds = new Set();

    function applyActiveNav(){
      allNavLinks.forEach(a => a.classList.remove('active'));
      const currentId = navSectionIds.find(id => activeSectionIds.has(id));
      if(!currentId) return;
      const firstMatch = allNavLinks.find(a => a.getAttribute('href') === `#${currentId}`);
      if(firstMatch) firstMatch.classList.add('active');
    }

    const navSectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting) activeSectionIds.add(entry.target.id);
        else activeSectionIds.delete(entry.target.id);
      });
      applyActiveNav();
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    navSectionIds.forEach(id => {
      const el = document.getElementById(id);
      if(el) navSectionObserver.observe(el);
    });
  }

  // ---- Sticky header elevation on scroll ----
  const headerEl = document.querySelector('header');
  let ticking = false;
  function onScroll(){
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(()=>{
      if(headerEl) headerEl.classList.toggle('scrolled', window.scrollY > 20);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  // ---- Mobile nav ----
  function toggleMobileNav(){
    const btn = document.getElementById('nav-toggle');
    const panel = document.getElementById('mobile-nav-panel');
    if(!btn || !panel) return;
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if(open){ const firstLink = panel.querySelector('a'); if(firstLink) firstLink.focus(); }
  }
  function closeMobileNav(){
    const btn = document.getElementById('nav-toggle');
    const panel = document.getElementById('mobile-nav-panel');
    if(!panel || !panel.classList.contains('open')) return;
    panel.classList.remove('open');
    if(btn){ btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Open menu'); }
  }
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeMobileNav(); });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('mobile-nav-panel');
    const btn = document.getElementById('nav-toggle');
    if(!panel || !panel.classList.contains('open')) return;
    if(panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    closeMobileNav();
  });

  // ---- Fusion orbit: keep flow-dot radius proportional to the rendered circle (fixes overflow on narrow screens) ----
  function sizeOrbitFlow(){
    const orbit = document.querySelector('.fusion-orbit');
    if(!orbit) return;
    const r = Math.max(orbit.clientWidth, orbit.clientHeight) / 2 * 0.86;
    orbit.querySelectorAll('.orbit-flow-dot').forEach(dot => { dot.style.setProperty('--orbit-r', r + 'px'); });
  }
  sizeOrbitFlow();
  window.addEventListener('resize', () => {
    clearTimeout(window._orbitResizeT);
    window._orbitResizeT = setTimeout(sizeOrbitFlow, 150);
    if(window.innerWidth > 860) closeMobileNav();
  });

  // ---- Contact form: no backend exists, so this opens the visitor's email client with the message pre-filled rather than pretending to submit anywhere ----
  function handleContactSubmit(e){
    e.preventDefault();
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const name = val('cf-name');
    const email = val('cf-email');
    const company = val('cf-company');
    const phone = val('cf-phone');
    const message = val('cf-message');
    const note = document.getElementById('cf-note');
    if(!name || !email){
      if(note) note.textContent = 'Please add your name and email first.';
      return false;
    }
    const subject = encodeURIComponent(`Hgear.ai inquiry from ${name}`);
    const lines = [message || '(no message provided)', '', `Name: ${name}`, `Email: ${email}`];
    if(company) lines.push(`Company: ${company}`);
    if(phone) lines.push(`Phone: ${phone}`);
    const body = encodeURIComponent(lines.join('\n'));
    if(note) note.textContent = 'Opening your email app to send this to connect@hgear.ai…';
    window.location.href = `mailto:connect@hgear.ai?subject=${subject}&body=${body}`;
    return false;
  }
