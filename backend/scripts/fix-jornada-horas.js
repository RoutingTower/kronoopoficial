// Corrige registros cujo horaInicio/horaFim ficaram gravados como número
// serial do Excel (ex.: "0.9166666666666666") em vez de "HH:mm" — bug da
// importação em massa corrigido em frontend/js/utils.js (parseXLSX). Afeta
// três coleções: users (jornada.horaInicio/horaFim dos analistas),
// baseMestra e suplencias (horaInicio/horaFim no documento raiz — Operações
// Fixas e Coberturas avulsas). Este script só normaliza os dados que já
// estão no Firestore; não precisa ser rodado de novo depois que a correção
// do import estiver no ar. Rodar a partir de backend/:
//   node scripts/fix-jornada-horas.js        (mostra o que seria alterado)
//   node scripts/fix-jornada-horas.js --apply (aplica de fato)

const firestoreService = require("../src/services/firestoreService");

function excelSerialToHHMM(v) {
  const totalMin = Math.round((v % 1) * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function isBadTime(v) {
  return typeof v === "string" && /^0?\.\d+$/.test(v.trim());
}

async function fixUsersJornada() {
  const apply = process.argv.includes("--apply");
  const users = await firestoreService.listAll("users");
  const fixes = [];

  for (const u of users) {
    if (!u.jornada) continue;
    const { horaInicio, horaFim } = u.jornada;
    const badInicio = isBadTime(horaInicio);
    const badFim = isBadTime(horaFim);
    if (!badInicio && !badFim) continue;

    const novaJornada = {
      ...u.jornada,
      horaInicio: badInicio ? excelSerialToHHMM(parseFloat(horaInicio)) : horaInicio,
      horaFim: badFim ? excelSerialToHHMM(parseFloat(horaFim)) : horaFim,
    };
    fixes.push({ id: u.id, label: u.name, de: u.jornada, para: novaJornada, patch: { jornada: novaJornada } });
  }

  return { collection: "users", label: "usuário(s) (jornada)", fixes, apply };
}

async function fixHoraInicioFimCollection(collection, labelField) {
  const apply = process.argv.includes("--apply");
  const docs = await firestoreService.listAll(collection);
  const fixes = [];

  for (const d of docs) {
    const badInicio = isBadTime(d.horaInicio);
    const badFim = isBadTime(d.horaFim);
    if (!badInicio && !badFim) continue;

    const patch = {};
    if (badInicio) patch.horaInicio = excelSerialToHHMM(parseFloat(d.horaInicio));
    if (badFim) patch.horaFim = excelSerialToHHMM(parseFloat(d.horaFim));
    fixes.push({
      id: d.id,
      label: d[labelField] || d.id,
      de: { horaInicio: d.horaInicio, horaFim: d.horaFim },
      para: { horaInicio: patch.horaInicio || d.horaInicio, horaFim: patch.horaFim || d.horaFim },
      patch,
    });
  }

  return { collection, label: `${collection} (horaInicio/horaFim)`, fixes, apply };
}

async function run() {
  const apply = process.argv.includes("--apply");
  const groups = [
    await fixUsersJornada(),
    await fixHoraInicioFimCollection("baseMestra", "operacao"),
    await fixHoraInicioFimCollection("suplencias", "operacao"),
  ];

  const totalFixes = groups.reduce((acc, g) => acc + g.fixes.length, 0);
  if (totalFixes === 0) {
    console.log("Nenhum registro com hora em formato decimal encontrado.");
    return;
  }

  for (const g of groups) {
    if (g.fixes.length === 0) continue;
    console.log(`\n${g.fixes.length} registro(s) em ${g.label} a corrigir:`);
    for (const f of g.fixes) {
      console.log(`- ${f.label} (${f.id}): ${f.de.horaInicio}-${f.de.horaFim} -> ${f.para.horaInicio}-${f.para.horaFim}`);
    }
  }

  if (!apply) {
    console.log("\nModo simulação — nada foi alterado. Rode com --apply para gravar no Firestore.");
    return;
  }

  for (const g of groups) {
    for (const f of g.fixes) {
      await firestoreService.update(g.collection, f.id, f.patch);
    }
  }
  console.log(`\n${totalFixes} registro(s) atualizado(s) no Firestore.`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
