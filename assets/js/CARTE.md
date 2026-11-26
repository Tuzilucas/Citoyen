# assets/js/ — carte du dossier

[↑ dossier parent](../CARTE.md) · [⌂ racine](../../CARTE.md)

## Rôle

Scripts exécutés dans le navigateur.<!--a-->

## Fichiers

| Fichier | Description |
|---|---|
| `app.js` | Interface du site : recherche d'une commune, affichage des indicateurs et des sources. |
| `citoyen-lib.js` | Fonctions pures partagées par app.js (navigateur) et par les tests unitaires (Node). Aucune dépendance, aucun accès au DOM ni au réseau.<!--a--> |
| `taxe-fonciere.js` | Simulateur de taxe foncière (calcul et affichage). |

<!-- carte:fin — généré par carte.mjs (STRUCTURE-PROJET/04-outillage/carte). Écrire à la main : le texte de « Rôle » et la colonne Description ; ne pas toucher au reste (recalculé). -->
