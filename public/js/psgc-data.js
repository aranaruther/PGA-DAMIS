// ═══════════════════════════════════════════════════════════════════
// PGA-DAMIS — PSGC Address Loader
// Primary:  https://psgc.cloud/api  (live API, works from browser)
// Fallback: bundled static data below (used if API is unreachable)
// ═══════════════════════════════════════════════════════════════════
var PSGC_CACHE = {};  // { regions, provinces, cities, municipalities }

// ── Static fallback (PSA PSGC 2024) ─────────────────────────────
var PSGC_STATIC = {
  regions: [
    {code:"0100000000",name:"Region I (Ilocos Region)"},
    {code:"0200000000",name:"Region II (Cagayan Valley)"},
    {code:"0300000000",name:"Region III (Central Luzon)"},
    {code:"0400000000",name:"Region IV-A (CALABARZON)"},
    {code:"1700000000",name:"MIMAROPA Region"},
    {code:"0500000000",name:"Region V (Bicol Region)"},
    {code:"0600000000",name:"Region VI (Western Visayas)"},
    {code:"0700000000",name:"Region VII (Central Visayas)"},
    {code:"0800000000",name:"Region VIII (Eastern Visayas)"},
    {code:"0900000000",name:"Region IX (Zamboanga Peninsula)"},
    {code:"1000000000",name:"Region X (Northern Mindanao)"},
    {code:"1100000000",name:"Region XI (Davao Region)"},
    {code:"1200000000",name:"Region XII (SOCCSKSARGEN)"},
    {code:"1300000000",name:"National Capital Region (NCR)"},
    {code:"1400000000",name:"Cordillera Administrative Region (CAR)"},
    {code:"1600000000",name:"Region XIII (Caraga)"},
    {code:"1900000000",name:"Bangsamoro Autonomous Region (BARMM)"}
  ],
  provinces: [
    {code:"0102800000",name:"Ilocos Norte"},{code:"0102900000",name:"Ilocos Sur"},
    {code:"0103300000",name:"La Union"},{code:"0105500000",name:"Pangasinan"},
    {code:"0200900000",name:"Batanes"},{code:"0201500000",name:"Cagayan"},
    {code:"0203100000",name:"Isabela"},{code:"0205000000",name:"Nueva Vizcaya"},
    {code:"0205700000",name:"Quirino"},{code:"0300800000",name:"Bataan"},
    {code:"0301400000",name:"Bulacan"},{code:"0304900000",name:"Nueva Ecija"},
    {code:"0305400000",name:"Pampanga"},{code:"0306900000",name:"Tarlac"},
    {code:"0307100000",name:"Zambales"},{code:"0307700000",name:"Aurora"},
    {code:"0401000000",name:"Batangas"},{code:"0402100000",name:"Cavite"},
    {code:"0403400000",name:"Laguna"},{code:"0405600000",name:"Quezon"},
    {code:"0405800000",name:"Rizal"},{code:"1704000000",name:"Marinduque"},
    {code:"1705100000",name:"Occidental Mindoro"},{code:"1705200000",name:"Oriental Mindoro"},
    {code:"1705300000",name:"Palawan"},{code:"1705900000",name:"Romblon"},
    {code:"0500500000",name:"Albay"},{code:"0501600000",name:"Camarines Norte"},
    {code:"0501700000",name:"Camarines Sur"},{code:"0502000000",name:"Catanduanes"},
    {code:"0504100000",name:"Masbate"},{code:"0506200000",name:"Sorsogon"},
    {code:"0600400000",name:"Aklan"},{code:"0600600000",name:"Antique"},
    {code:"0601900000",name:"Capiz"},{code:"0603000000",name:"Iloilo"},
    {code:"0604500000",name:"Negros Occidental"},{code:"0607900000",name:"Guimaras"},
    {code:"0701200000",name:"Bohol"},{code:"0702200000",name:"Cebu"},
    {code:"0704600000",name:"Negros Oriental"},{code:"0706100000",name:"Siquijor"},
    {code:"0801200000",name:"Biliran"},{code:"0802600000",name:"Eastern Samar"},
    {code:"0803700000",name:"Leyte"},{code:"0804800000",name:"Northern Samar"},
    {code:"0806000000",name:"Samar (Western Samar)"},{code:"0806400000",name:"Southern Leyte"},
    {code:"0907200000",name:"Zamboanga del Norte"},{code:"0907300000",name:"Zamboanga del Sur"},
    {code:"0908300000",name:"Zamboanga Sibugay"},{code:"1001300000",name:"Bukidnon"},
    {code:"1001800000",name:"Camiguin"},{code:"1003500000",name:"Lanao del Norte"},
    {code:"1004200000",name:"Misamis Occidental"},{code:"1004300000",name:"Misamis Oriental"},
    {code:"1102300000",name:"Davao de Oro"},{code:"1101100000",name:"Davao del Norte"},
    {code:"1102200000",name:"Davao del Sur"},{code:"1108200000",name:"Davao Occidental"},
    {code:"1101200000",name:"Davao Oriental"},{code:"1204700000",name:"Cotabato"},
    {code:"1206300000",name:"Sarangani"},{code:"1206500000",name:"South Cotabato"},
    {code:"1206700000",name:"Sultan Kudarat"},{code:"1401100000",name:"Abra"},
    {code:"1401400000",name:"Apayao"},{code:"1401500000",name:"Benguet"},
    {code:"1403200000",name:"Ifugao"},{code:"1403300000",name:"Kalinga"},
    {code:"1405500000",name:"Mountain Province"},{code:"1600200000",name:"Agusan del Norte"},
    {code:"1600300000",name:"Agusan del Sur"},{code:"1606800000",name:"Dinagat Islands"},
    {code:"1606700000",name:"Surigao del Norte"},{code:"1606600000",name:"Surigao del Sur"},
    {code:"1903200000",name:"Basilan"},{code:"1903600000",name:"Lanao del Sur"},
    {code:"1908600000",name:"Maguindanao del Norte"},{code:"1908700000",name:"Maguindanao del Sur"},
    {code:"1909700000",name:"Sulu"},{code:"1909800000",name:"Tawi-Tawi"}
  ]
};
