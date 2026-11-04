---
name: feed-structure
description: Reporter automatiquement dans le dépôt STRUCTURE-PROJET chaque nouvelle fonctionnalité, correction, contrôle, outil ou leçon réutilisable développé dans ce projet — en version générique, dans le bon moule (identifié à partir du projet) ou dans le socle commun. À utiliser à la fin de chaque fonctionnalité terminée, sans attendre que l'utilisateur le demande.
---

# Alimenter STRUCTURE-PROJET

Version générique du socle. Si le moule d'origine fournit son propre `feed-structure`, c'est lui qui s'applique (il porte le même nom et remplace celui-ci).

## 1. Identifier le moule d'origine
Dans cet ordre, s'arrêter au premier indice net :
1. `CLAUDE.md` du projet, section « Alimenter le moule » : elle nomme le moule (ex. moule `appli mobile/`, moule `site web/`).
2. Fichiers caractéristiques :
   | Indices dans le projet | Moule |
   |---|---|
   | `app.json`, `public/index.html`, `supabase/migrations/`, `android/` | `appli mobile/` |
   | `site.json`, `content/*.json`, `src/render.mjs`, `scripts/build.mjs` | `site web/` |
3. `docs/REGISTRE-MOULES.md` de STRUCTURE-PROJET pour un moule plus récent.
4. Aucun moule ne correspond : demander à l'utilisateur. Ne jamais créer un nouveau moule sans son accord.

## 2. Trier
- **À reporter** : fonctionnalités génériques, corrections de sécurité ou de bug présentes aussi dans le moule, contrôles, scripts, procédures, pages légales génériques, leçons apprises.
- **À ne pas reporter** : ce qui est propre au projet (nom, contenus, textes marketing, couleurs, réglages), données réelles, identifiants, clés.
- **Niveau** :
  - propre au type de projet → le moule (`<moule>/`) ;
  - valable pour tout type de projet (traitement d'incident, crochet `pre-push`, CI manuelle, relecture de sécurité générique, `ERROR_LOG.md`) → le socle (`socle/`) ;
  - méthode ou pattern sans code exécutable → dossiers numérotés `00-methode/` à `06-fonctionnalites/`.

## 3. Accéder au dépôt
`add_repo` owner `Tuzilucas`, repo `STRUCTURE-PROJET`, accès `push` ; cloner dans `/home/user/structure-projet` (ou `git fetch origin main` sur le clone existant). Travailler sur la branche de la session, partie de `origin/main`.

## 4. Rendre générique
Aucun nom de projet, de personne, d'e-mail, d'URL ou de couleur en dur : utiliser le fichier de réglages et les espaces réservés du moule. Respecter les conventions du moule (lire son `README.md` et son `template/CLAUDE.md`).

## 5. Ranger
| Type | Destination |
|---|---|
| Code du squelette | `<moule>/template/` + test ou contrôle associé |
| Savoir-faire propre au moule | skill dans `<moule>/plugin/skills/`, puis `bash "<moule>/sync-plugin.sh"` |
| Savoir-faire commun | skill dans `socle/plugin/skills/`, puis le `sync-plugin.sh` de **chaque** moule |
| Relecture | agent dans `<moule>/plugin/agents/` ou `socle/plugin/agents/` |
| Fichier commun du squelette | `socle/template/`, puis le `sync-plugin.sh` de chaque moule |
| Procédure | `<moule>/docs/0X-….md` et `<moule>/template/docs/*.md` |
| Erreur et correction | `<moule>/docs/*LECONS-APPRISES.md` |
| Historique | entrée datée dans `<moule>/CHANGELOG.md` ou `socle/CHANGELOG.md` |

## 6. Vérifier (obligatoire)
- Dans chaque `template/` touché (tous les moules si le socle a changé) : `npm run check` (0 erreur), plus les audits que le moule impose.
- `claude plugin validate` sur chaque plugin modifié, puis `claude plugin validate .` à la racine.

## 7. Livrer
Commit clair, Pull Request, fusion si l'utilisateur l'a autorisé (sinon lui demander). Dire en une ligne ce qui a été ajouté et où (moule ou socle).
