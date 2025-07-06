document.addEventListener('DOMContentLoaded', () => {

    const dom = {
        // Inputs
        raumtyp: document.getElementById('raumtyp'),
        gebaeudetyp: document.getElementById('gebaeudetyp'),
        raumLaenge: document.getElementById('raumLaenge'),
        raumBreite: document.getElementById('raumBreite'),
        raumHoehe: document.getElementById('raumHoehe'),
        fensterFlaeche: document.getElementById('fensterFlaeche'),
        personenAnzahl: document.getElementById('personenAnzahl'),
        geraeteLast: document.getElementById('geraeteLast'),
        lichtLast: document.getElementById('lichtLast'),
        // Results
        resVolumenstrom: document.getElementById('res-volumenstrom'),
        infoVolumenstrom: document.getElementById('info-volumenstrom'),
        resHeizlast: document.getElementById('res-heizlast'),
        resKuehllast: document.getElementById('res-kuehllast'),
        erlaeuterung: document.getElementById('erlaeuterung'),
        // Hinweis-Boxen
        hinweisBox: document.getElementById('hinweis-box'),
        sicherheitshinweisBox: document.getElementById('sicherheitshinweis-box'),
    };

    const allInputs = document.querySelectorAll('input, select');
    allInputs.forEach(input => input.addEventListener('input', calculateAll));

    // --- Voreinstellungen und Konstanten basierend auf Normen ---
    const presets = {
        raumtypen: {
            buero: { personenLast: 100, luftratePerson: 30, luftwechsel: 3, maxPersonenProM2: 0.125 },
            seminar: { personenLast: 120, luftratePerson: 30, luftwechsel: 4, maxPersonenProM2: 1.0 },
            hoersaal: { personenLast: 120, luftratePerson: 30, luftwechsel: 5, maxPersonenProM2: 1.5 }, // *** NEU ***
            labor: { personenLast: 140, luftratePerson: 30, luftwechsel: 8, luftrateFlaeche: 25, maxPersonenProM2: 0.2 },
            technik: { personenLast: 0, luftratePerson: 30, luftwechsel: 10, maxPersonenProM2: 0 },
        },
        gebaeude: {
            unsaniert_alt: { u_wand: 1.4, u_fenster: 2.8, u_dach: 0.8 },
            saniert_alt: { u_wand: 0.8, u_fenster: 1.9, u_dach: 0.4 },
            enev2002: { u_wand: 0.4, u_fenster: 1.3, u_dach: 0.25 },
            modern: { u_wand: 0.25, u_fenster: 0.9, u_dach: 0.18 },
        },
        temperaturen: {
            innen_winter: 21, aussen_winter: -10,
            innen_sommer: 24, aussen_sommer: 32,
            max_asr: 26,
        },
        sonnenlast_fenster: 150,
        cp_luft: 0.34,
    };

    function updateDefaults() {
        const raumtyp = dom.raumtyp.value;
        if (raumtyp === 'technik') {
            dom.personenAnzahl.value = 0;
            dom.geraeteLast.value = 5000;
        } else if (raumtyp === 'labor') {
            dom.personenAnzahl.value = 4;
            dom.geraeteLast.value = 1500;
        } else if (raumtyp === 'seminar') {
             dom.personenAnzahl.value = 15;
            dom.geraeteLast.value = 500;
        } else if (raumtyp === 'hoersaal') { // *** NEU ***
             dom.personenAnzahl.value = 80;
             dom.geraeteLast.value = 1000;
        } else {
            dom.personenAnzahl.value = 4;
            dom.geraeteLast.value = 800;
        }
        calculateAll();
    }
    
    dom.raumtyp.addEventListener('change', updateDefaults);

    function calculateAll() {
        const sicherheitshinweise = [];
        const hinweise = []; 
        
        const inputs = {
            raumtyp: dom.raumtyp.value,
            gebaeudetyp: dom.gebaeudetyp.value,
            laenge: parseFloat(dom.raumLaenge.value) || 0,
            breite: parseFloat(dom.raumBreite.value) || 0,
            hoehe: parseFloat(dom.raumHoehe.value) || 0,
            fensterFlaeche: parseFloat(dom.fensterFlaeche.value) || 0,
            personen: parseInt(dom.personenAnzahl.value) || 0,
            geraete: parseFloat(dom.geraeteLast.value) || 0,
            licht: parseFloat(dom.lichtLast.value) || 0,
        };

        const raumflaeche = inputs.laenge * inputs.breite;
        if (raumflaeche === 0) return;

        const raumvolumen = raumflaeche * inputs.hoehe;
        const p = presets;
        const raumSettings = p.raumtypen[inputs.raumtyp];
        const gebaeudeSettings = p.gebaeude[inputs.gebaeudetyp];
        
        const v_personen = inputs.personen * raumSettings.luftratePerson;
        const v_luftwechsel = raumvolumen * raumSettings.luftwechsel;
        const v_flaeche = raumflaeche * (raumSettings.luftrateFlaeche || 0);
        
        const waermelast_intern = inputs.personen * raumSettings.personenLast + inputs.geraete + inputs.licht;
        const v_waermelast = waermelast_intern / (p.cp_luft * (p.temperaturen.aussen_sommer - p.temperaturen.innen_sommer));
        
        const kandidaten = {
            'Hygiene': v_personen,
            'Mindest-Luftwechsel': v_luftwechsel,
            'Flächenrate': v_flaeche,
            'Wärmelastabfuhr': (inputs.raumtyp === 'technik' || inputs.raumtyp === 'hoersaal' ? v_waermelast : 0)
        };
        
        let v_final = 0;
        let v_info = 'Kein Bedarf';
        for (const [key, value] of Object.entries(kandidaten)) {
            if (value > v_final) {
                v_final = value;
                v_info = key;
            }
        }
        
        if (raumSettings.maxPersonenProM2 > 0 && (inputs.personen / raumflaeche) > raumSettings.maxPersonenProM2) {
            sicherheitshinweise.push(`⚠️ <strong>Personendichte:</strong> Die angegebene Personenzahl ist sehr hoch. Beachten Sie die Vorgaben der Versammlungsstättenverordnung (VStättV) oder der DGUV.`);
        }
        
        if (inputs.raumtyp === 'labor') {
            hinweise.push(`💡 <strong>Normbezug Labor:</strong> Der Luftbedarf wird aus dem höchsten Wert von Personenbedarf, <strong>${raumSettings.luftwechsel}-fachem Luftwechsel</strong> oder <strong>${raumSettings.luftrateFlaeche} m³/h pro m²</strong> ermittelt (gem. TRGS 526 / DIN 1946-7).`);
        } else if (inputs.raumtyp === 'buero' || inputs.raumtyp === 'seminar' || inputs.raumtyp === 'hoersaal') {
             hinweise.push(`💡 <strong>Normbezug Büro/Seminar/Hörsaal:</strong> Der Luftbedarf pro Person von <strong>${raumSettings.luftratePerson} m³/h</strong> entspricht den Anforderungen der Arbeitsstättenregel (ASR A3.6).`);
        } else if (inputs.raumtyp === 'technik') { // *** NEU ***
             hinweise.push(`💡 <strong>Normbezug Technik/Serverraum:</strong> Die Auslegung erfolgt primär nach der abzuführenden Wärmelast. Ein Mindestluftwechsel von <strong>${raumSettings.luftwechsel} 1/h</strong> wird zur Grundlüftung angenommen (vgl. VDI 2054 / BSI).`);
        }
        
        const kuehllast_total_w = waermelast_intern + (inputs.fensterFlaeche * p.sonnenlast_fenster);
        const temp_ohne_kuehlung = p.temperaturen.aussen_sommer + kuehllast_total_w / (v_final * p.cp_luft);
        if (v_final > 0 && temp_ohne_kuehlung > p.temperaturen.max_asr) {
            sicherheitshinweise.push(`⚠️ <strong>Temperatur-Check (ASR A3.5):</strong> Ohne Kühlung würde die Raumtemperatur ca. <strong>${temp_ohne_kuehlung.toFixed(1)}°C</strong> erreichen. Maßnahmen zur Temperatursenkung sind erforderlich, da die 26°C-Marke überschritten wird.`);
        }
        
        const dt_winter = p.temperaturen.innen_winter - p.temperaturen.aussen_winter;
        const heizlast_transmission = ( (inputs.laenge + inputs.breite) * 2 * inputs.hoehe - inputs.fensterFlaeche) * gebaeudeSettings.u_wand * dt_winter + inputs.fensterFlaeche * gebaeudeSettings.u_fenster * dt_winter + raumflaeche * gebaeudeSettings.u_dach * dt_winter;
        const heizlast_lueftung = v_final * p.cp_luft * dt_winter;
        const heizlast_total_kw = (heizlast_transmission + heizlast_lueftung - waermelast_intern * 0.5) / 1000;

        dom.resVolumenstrom.textContent = `${Math.ceil(v_final)} m³/h`;
        dom.infoVolumenstrom.textContent = `Grundlage: ${v_info}`;
        dom.resHeizlast.textContent = `${heizlast_total_kw.toFixed(2)} kW`;
        dom.resKuehllast.textContent = `${(kuehllast_total_w / 1000).toFixed(2)} kW`;
        
        dom.erlaeuterung.innerHTML = `
            <p><strong>Detaillierter Luftbedarf:</strong> Personen (${v_personen.toFixed(0)} m³/h) | Luftwechsel (${v_luftwechsel.toFixed(0)} m³/h) | Fläche (${v_flaeche.toFixed(0)} m³/h)</p>
            <p><strong>Detaillierte Kühllast:</strong> Interne Lasten (${(waermelast_intern/1000).toFixed(2)} kW) | Sonneneinstrahlung (${(inputs.fensterFlaeche * p.sonnenlast_fenster/1000).toFixed(2)} kW)</p>
        `;

        renderHinweise(dom.hinweisBox, hinweise);
        renderHinweise(dom.sicherheitshinweisBox, sicherheitshinweise);
    }
    
    function renderHinweise(box, hinweisArray) {
        if (hinweisArray.length > 0) {
            box.innerHTML = hinweisArray.map(h => `<p>${h}</p>`).join('');
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    }

    // Initiale Berechnung
    updateDefaults();
});
