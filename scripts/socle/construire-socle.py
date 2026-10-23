#!/usr/bin/env python3
"""Construit le socle commun des territoires (data/entities.json et data/entities/communes/<DEP>.json).

Une seule structure pour toutes les communes, celle de la fiche pilote de Fameck : identité INSEE,
département, région, codes postaux, intercommunalité de rattachement, population légale.

Sources (téléchargées par le script, jamais modifiées à la main) :
- INSEE, Code officiel géographique au 1er janvier 2026 : communes, départements, régions
  (https://www.insee.fr/fr/information/8740222) ;
- DGCL, composition communale des EPCI à fiscalité propre au 1er janvier 2026, avec les populations
  légales en vigueur (https://www.collectivites-locales.gouv.fr/.../liste-et-composition-des-epci-fiscalite-propre) ;
- geo.api.gouv.fr : codes postaux, utilisés seulement pour la recherche (le code INSEE identifie la commune).

Usage : python3 scripts/socle/construire-socle.py [dossier_de_téléchargement]
Dépendance : openpyxl (lecture du fichier .xlsx de la DGCL).
"""
import csv, json, os, sys, time, urllib.request
from collections import defaultdict

import openpyxl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".cache-socle")
COG = "https://www.insee.fr/fr/statistiques/fichier/8740222/"
EPCI_XLSX = "https://www.collectivites-locales.gouv.fr/files/files/Etudes-et-statistiques/DESL/2026/EPCI/epcicom2026.xlsx"
GEO = "https://geo.api.gouv.fr/communes?fields=code,codesPostaux&format=json"
MILLESIME = "2026"
TODAY = time.strftime("%Y-%m-%d")

SOURCES = {
    "insee-cog-2026": {
        "producer": "INSEE",
        "title": "Code officiel géographique au 1er janvier 2026",
        "url": "https://www.insee.fr/fr/information/8740222",
    },
    "dgcl-epci-2026": {
        "producer": "DGCL (ministère de l'Intérieur)",
        "title": "Composition communale des EPCI à fiscalité propre au 1er janvier 2026",
        "url": "https://www.collectivites-locales.gouv.fr/etudes-et-statistiques/acces-aux-statistiques-par-thematique/perimetre-des-intercommunalites/liste-et-composition-des-epci-fiscalite-propre",
    },
    "geo-api-codes-postaux": {
        "producer": "Etalab / geo.api.gouv.fr",
        "title": "API Découpage administratif : codes postaux des communes",
        "url": "https://geo.api.gouv.fr/decoupage-administratif",
    },
}


def fetch(url, name, attempts=8):
    """Téléchargement avec réessais (réseau intermittent) ; fichier mis en cache."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    for i in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Information-citoyenne"}), timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            return path
        except Exception as e:  # noqa: BLE001 — on réessaie puis on échoue clairement
            print(f"  essai {i + 1} : {url} : {e}", file=sys.stderr)
            time.sleep(2 + i * 2)
    sys.exit(f"Téléchargement impossible : {url}")


def read_csv(name):
    with open(fetch(COG + name, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    regions = {r["REG"]: r["LIBELLE"] for r in read_csv(f"v_region_{MILLESIME}.csv")}
    departements = {d["DEP"]: d for d in read_csv(f"v_departement_{MILLESIME}.csv")}
    communes = [c for c in read_csv(f"v_commune_{MILLESIME}.csv") if c["TYPECOM"] == "COM"]

    ws = openpyxl.load_workbook(fetch(EPCI_XLSX, f"epcicom{MILLESIME}.xlsx"), read_only=True).active
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    col = {k: header.index(k) for k in ("siren", "raison_sociale", "nature_juridique", "insee", "siren_membre", "ptot_2026", "pmun_2026")}
    membership, epcis = {}, {}
    for r in rows:
        if not r[col["insee"]]:
            continue
        code = str(r[col["insee"]])
        epci = {"entity_id": str(r[col["siren"]]), "official_name": r[col["raison_sociale"]], "legal_nature": r[col["nature_juridique"]]}
        membership[code] = {"epci": epci, "siren": str(r[col["siren_membre"]]), "ptot": r[col["ptot_2026"]], "pmun": r[col["pmun_2026"]]}
        epcis.setdefault(epci["entity_id"], {**epci, "members": 0})["members"] += 1

    with open(fetch(GEO, "geo-codes-postaux.json"), encoding="utf-8") as f:
        postal = {c["code"]: sorted(c.get("codesPostaux") or []) for c in json.load(f)}

    by_dep = defaultdict(list)
    missing_postal, isolated = 0, []
    for c in communes:
        code, dep = c["COM"], c["DEP"]
        m = membership.get(code)
        if m is None:
            isolated.append(code)
        cps = postal.get(code, [])
        missing_postal += not cps
        by_dep[dep].append({
            "entity_id": code,
            "entity_type": "commune",
            "official_name": c["LIBELLE"],
            "department_code": dep,
            "department_name": departements[dep]["LIBELLE"],
            "region_code": c["REG"],
            "region_name": regions.get(c["REG"]),
            "postal_codes": cps,
            "siren": m["siren"] if m else None,
            # Commune isolée (îles mono-communales) : aucune intercommunalité, jamais une valeur inventée.
            "parent_epci": {**m["epci"], "verification_source_id": "dgcl-epci-2026"} if m else None,
            "population": {"municipale": m["pmun"], "totale": m["ptot"], "en_vigueur_au": f"{MILLESIME}-01-01", "source_id": "dgcl-epci-2026"} if m else None,
            "verification_status": f"verified_from_insee_cog_{MILLESIME}",
            "verification_date": TODAY,
            "source_id": "insee-cog-2026",
        })

    out_dir = os.path.join(ROOT, "data", "entities", "communes")
    os.makedirs(out_dir, exist_ok=True)
    for name in os.listdir(out_dir):
        os.remove(os.path.join(out_dir, name))
    search = []
    for dep, items in sorted(by_dep.items()):
        items.sort(key=lambda e: e["entity_id"])
        with open(os.path.join(out_dir, f"{dep}.json"), "w", encoding="utf-8") as f:
            json.dump({"schema_version": "2.0.0", "department_code": dep, "entities": items}, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
        search.extend([e["entity_id"], e["official_name"], dep, e["postal_codes"]] for e in items)

    # Index compact pour la recherche de secours (si geo.api.gouv.fr ne répond pas) : [code, nom, département, codes postaux].
    with open(os.path.join(ROOT, "data", "entities", "recherche.json"), "w", encoding="utf-8") as f:
        json.dump({"schema_version": "2.0.0", "fields": ["code_insee", "nom", "departement", "codes_postaux"], "communes": search}, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    index = {
        "schema_version": "2.0.0",
        "description": "Socle commun des territoires : une structure identique pour chaque commune, chaque département, chaque région et chaque intercommunalité.",
        "millesime": f"{MILLESIME}-01-01",
        "generated_on": TODAY,
        "generator": "scripts/socle/construire-socle.py",
        "sources": SOURCES,
        "counts": {"communes": len(communes), "departements": len(departements), "regions": len(regions), "epci": len(epcis), "communes_sans_epci": len(isolated), "communes_sans_code_postal": missing_postal},
        "communes_files": "data/entities/communes/<code département>.json",
        "search_index": "data/entities/recherche.json",
        "entities": (
            [{"entity_id": k, "entity_type": "region", "official_name": v, "source_id": "insee-cog-2026"} for k, v in sorted(regions.items())]
            + [{"entity_id": k, "entity_type": "departement", "official_name": d["LIBELLE"], "region_code": d["REG"], "region_name": regions.get(d["REG"]), "chef_lieu": d["CHEFLIEU"], "source_id": "insee-cog-2026"} for k, d in sorted(departements.items())]
            + [{"entity_id": k, "entity_type": "epci", "official_name": e["official_name"], "legal_nature": e["legal_nature"], "member_communes": e["members"], "source_id": "dgcl-epci-2026"} for k, e in sorted(epcis.items())]
        ),
        "notes": [
            "Le code INSEE identifie la commune ; le code postal sert uniquement à la recherche.",
            "Les données financières ne sont pas stockées ici : elles sont lues à la demande auprès de l'OFGL et de la DGFiP, avec la même structure pour toutes les communes (citoyen-lib.js, buildCommuneDataset).",
            "Une commune sans intercommunalité (îles mono-communales) a parent_epci = null ; une donnée absente vaut null, jamais 0.",
        ],
    }
    with open(os.path.join(ROOT, "data", "entities.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{len(communes)} communes ({len(by_dep)} fichiers), {len(epcis)} EPCI, sans EPCI : {isolated}, sans code postal : {missing_postal}")


if __name__ == "__main__":
    main()
