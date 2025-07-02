document.addEventListener('DOMContentLoaded', () => {

    const dom = {
        // Inputs
        tempAussen: document.getElementById('tempAussen'),
        rhAussen: document.getElementById('rhAussen'),
        tempZuluft: document.getElementById('tempZuluft'),
        rhZuluft: document.getElementById('rhZuluft'),
        volumenstrom: document.getElementById('volumenstrom'),
        druck: document.getElementById('druck'),
        kuehlerAktiv: document.getElementById('kuehlerAktiv'),
        sollFeuchteWrapper: document.getElementById('sollFeuchteWrapper'),
        resetBtn: document.getElementById('resetBtn'),

        // Process Flow
        processOverviewContainer: document.getElementById('process-overview-container'),
        nodes: [document.getElementById('node-0'), document.getElementById('node-1'), document.getElementById('node-2'), document.getElementById('node-3'), document.getElementById('node-final')],
        compVE: { node: document.getElementById('comp-ve'), p: document.getElementById('res-p-ve') },
        compK: { node: document.getElementById('comp-k'), p: document.getElementById('res-p-k') },
        compNE: { node: document.getElementById('comp-ne'), p: document.getElementById('res-p-ne') },
        
        // Summary
        summaryPowerHeat: document.getElementById('summary-power-heat'),
        summaryPowerCool: document.getElementById('summary-power-cool'),
        summaryTAussen: document.getElementById('summary-t-aussen'),
        summaryRhAussen: document.getElementById('summary-rh-aussen'),
        summaryXAussen: document.getElementById('summary-x-aussen'),
        summaryXGm3Aussen: document.getElementById('summary-x-gm3-aussen'),
        summaryTZuluft: document.getElementById('summary-t-zuluft'),
        summaryRhZuluft: document.getElementById('summary-rh-zuluft'),
        summaryXZuluft: document.getElementById('summary-x-zuluft'),
        summaryXGm3Zuluft: document.getElementById('summary-x-gm3-zuluft'),
    };
    
    const allInputs = document.querySelectorAll('input');
    storeInitialValues(); 

    const TOLERANCE = 0.01; 
    const RHO_LUFT = 1.2; // kg/m³

    // --- Thermodynamische Hilfsfunktionen ---
    function getPs(T) { return 611.2 * Math.exp((17.62 * T) / (243.12 + T)); }
    function getX(T, rH, p) { const p_s = getPs(T); const p_v = (rH / 100) * p_s; return 622 * (p_v / (p - p_v)); }
    function getRh(T, x, p) { const p_s = getPs(T); const p_v = (p * x) / (622 + x); return Math.min(100, (p_v / p_s) * 100); }
    function getTd(x, p) { const p_v = (p * x) / (622 + x); return (243.12 * Math.log(p_v / 611.2)) / (17.62 - Math.log(p_v / 611.2)); }
    function getH(T, x_g_kg) { const x_kg_kg = x_g_kg / 1000.0; return 1.006 * T + x_kg_kg * (2501 + 1.86 * T); }

    // --- Hauptberechnungsfunktion ---
    function calculateAll() {
        try {
            const inputs = {
                tempAussen: parseFloat(dom.tempAussen.value) || 0,
                rhAussen: parseFloat(dom.rhAussen.value) || 0,
                tempZuluft: parseFloat(dom.tempZuluft.value) || 0,
                rhZuluft: parseFloat(dom.rhZuluft.value) || 0,
                volumenstrom: parseFloat(dom.volumenstrom.value) || 0,
                druck: (parseFloat(dom.druck.value) || 1013.25) * 100,
                kuehlerAktiv: dom.kuehlerAktiv.checked,
                tempVorerhitzerSoll: 5.0,
            };

            // 1. Zustände definieren
            const aussen = { t: inputs.tempAussen, rh: inputs.rhAussen, x: getX(inputs.tempAussen, inputs.rhAussen, inputs.druck) };
            if (!isFinite(aussen.x)) return; // Abbruch bei ungültigen Werten
            aussen.h = getH(aussen.t, aussen.x);
            aussen.x_gm3 = aussen.x * RHO_LUFT;

            const zuluftSoll = { t: inputs.tempZuluft };
            zuluftSoll.x = inputs.kuehlerAktiv ? getX(zuluftSoll.t, inputs.rhZuluft, inputs.druck) : aussen.x;
            zuluftSoll.h = getH(zuluftSoll.t, zuluftSoll.x);

            // 2. Prozesskette simulieren
            const massenstrom_kg_s = (inputs.volumenstrom / 3600) * RHO_LUFT;
            let states = [aussen, { ...aussen }, { ...aussen }, { ...aussen }];
            let operations = { ve: { p: 0 }, k: { p: 0 }, ne: { p: 0 } };
            let currentState = states[0];

            // Vorerhitzer
            if (currentState.t < inputs.tempVorerhitzerSoll) {
                const hNach = getH(inputs.tempVorerhitzerSoll, currentState.x);
                operations.ve.p = massenstrom_kg_s * (hNach - currentState.h);
                currentState = { t: inputs.tempVorerhitzerSoll, h: hNach, x: currentState.x, rh: getRh(inputs.tempVorerhitzerSoll, currentState.x, inputs.druck) };
            }
            states[1] = { ...currentState };

            // Kühler / Entfeuchter
            if (inputs.kuehlerAktiv) {
                const needsDehumidification = currentState.x > zuluftSoll.x + TOLERANCE;
                const needsCooling = currentState.t > zuluftSoll.t + TOLERANCE;
                if (needsDehumidification) {
                    const tempNachKuehler = getTd(zuluftSoll.x, inputs.druck);
                    const hNachKuehler = getH(tempNachKuehler, zuluftSoll.x);
                    operations.k.p = massenstrom_kg_s * (currentState.h - hNachKuehler);
                    currentState = { t: tempNachKuehler, h: hNachKuehler, x: zuluftSoll.x, rh: getRh(tempNachKuehler, zuluftSoll.x, inputs.druck) };
                } else if (needsCooling) {
                    const h_final = getH(zuluftSoll.t, currentState.x);
                    operations.k.p = massenstrom_kg_s * (currentState.h - h_final);
                    currentState = { t: zuluftSoll.t, h: h_final, x: currentState.x, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck) };
                }
            }
            states[2] = { ...currentState };

            // Nacherhitzer
            if (currentState.t < zuluftSoll.t - TOLERANCE) {
                const h_final = getH(zuluftSoll.t, currentState.x);
                operations.ne.p = massenstrom_kg_s * (h_final - currentState.h);
                currentState = { t: zuluftSoll.t, h: h_final, x: currentState.x, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck) };
            }
            states[3] = { ...currentState };
            
            // 3. Finale Zuluft-Werte für Zusammenfassung berechnen
            const finalState = states[3];
            finalState.rh = getRh(finalState.t, finalState.x, inputs.druck);
            finalState.x_gm3 = finalState.x * RHO_LUFT;

            renderAll(states, operations, aussen, finalState);
        } catch (error) {
            console.error("Berechnungsfehler:", error);
        }
    }
    
    // --- Anzeige-Aktualisierungsfunktion ---
    function renderAll(states, operations, aussen, finalState) {
        // Prozesskette
        const activeSteps = Object.entries(operations).filter(([, op]) => op.p > 0);
        if (activeSteps.length > 0) {
            const activeNames = activeSteps.map(([key]) => key.toUpperCase());
            const isCooling = operations.k.p > 0;
            dom.processOverviewContainer.innerHTML = `<div class="process-overview ${isCooling ? 'process-info' : 'process-heating'}">Prozesskette: ${activeNames.join(' → ')}</div>`;
        } else {
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-success">Idealzustand</div>`;
        }

        // Fließdiagramm-Werte
        for (let i = 0; i < 4; i++) {
            updateStateNode(dom.nodes[i], i, states[i]);
        }
        updateStateNode(dom.nodes[4], 'final', finalState);
        
        // Komponenten-Leistungen
        updateComponentNode(dom.compVE, operations.ve.p);
        updateComponentNode(dom.compK, operations.k.p);
        updateComponentNode(dom.compNE, operations.ne.p);

        // Zusammenfassung
        const gesamtleistungWaerme = operations.ve.p + operations.ne.p;
        const gesamtleistungKaelte = operations.k.p;
        dom.summaryPowerHeat.textContent = `${formatGerman(gesamtleistungWaerme, 2)} kW`;
        dom.summaryPowerCool.textContent = `${formatGerman(gesamtleistungKaelte, 2)} kW`;
        
        // Vergleichstabelle
        dom.summaryTAussen.textContent = `${formatGerman(aussen.t, 1)} °C`;
        dom.summaryRhAussen.textContent = `${formatGerman(aussen.rh, 1)} %`;
        dom.summaryXAussen.textContent = `${formatGerman(aussen.x, 2)} g/kg`;
        dom.summaryXGm3Aussen.textContent = `${formatGerman(aussen.x_gm3, 2)} g/m³`;
        dom.summaryTZuluft.textContent = `${formatGerman(finalState.t, 1)} °C`;
        dom.summaryRhZuluft.textContent = `${formatGerman(finalState.rh, 1)} %`;
        dom.summaryXZuluft.textContent = `${formatGerman(finalState.x, 2)} g/kg`;
        dom.summaryXGm3Zuluft.textContent = `${formatGerman(finalState.x_gm3, 2)} g/m³`;
    }
    
    function updateStateNode(node, index, state) {
        const tSpan = node.querySelector(`#res-t-${index}`);
        const rhSpan = node.querySelector(`#res-rh-${index}`);
        const xSpan = node.querySelector(`#res-x-${index}`);
        if (tSpan) tSpan.textContent = formatGerman(state.t, 1);
        if (rhSpan) rhSpan.textContent = formatGerman(state.rh, 1);
        if (xSpan) xSpan.textContent = formatGerman(state.x, 2);
    }
    
    function updateComponentNode(comp, power) {
        comp.p.textContent = formatGerman(power, 2);
        comp.node.classList.toggle('active', power > 0);
        comp.node.classList.toggle('inactive', power <= 0);
    }
    
    function formatGerman(num, decimals = 0) {
        return isNaN(num) ? '--' : num.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    // --- Event Handling & Initialisierung ---
    function handleKuehlerToggle() {
        dom.sollFeuchteWrapper.style.display = dom.kuehlerAktiv.checked ? 'block' : 'none';
    }

    function storeInitialValues() {
        allInputs.forEach(el => {
            if (el.type === 'checkbox') el.dataset.defaultChecked = el.checked;
            else el.dataset.defaultValue = el.value;
        });
    }

    function resetToDefaults() {
        allInputs.forEach(el => {
            if (el.type === 'checkbox') el.checked = el.dataset.defaultChecked === 'true';
            else if (el.dataset.defaultValue) el.value = el.dataset.defaultValue;
        });
        handleKuehlerToggle();
        calculateAll();
    }

    allInputs.forEach(input => input.addEventListener('input', calculateAll));
    dom.kuehlerAktiv.addEventListener('change', () => {
        handleKuehlerToggle();
        calculateAll();
    });
    dom.resetBtn.addEventListener('click', resetToDefaults);

    // Erster Start
    handleKuehlerToggle();
    calculateAll();
});
