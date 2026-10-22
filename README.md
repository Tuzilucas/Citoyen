# Information citoyenne — site public

Ce dépôt contient la version web publique de l’Observatoire citoyen : interface HTML/CSS/JavaScript et jeux de données affichés. Le dépôt de développement reste séparé et privé.

## Direction visuelle

L’interface adopte une direction éditoriale : grille de publication, typographie à empattements pour les titres, séparateurs francs et annotations proches des données. Elle évite les tableaux de bord génériques et conserve les états de validation explicites. Le brief réutilisable est documenté dans le dépôt privé STRUCTURE-PROJET, sous `03-ui/exemples/direction-artistique-information-citoyenne.md`.

## État du prototype

- Indicateur présenté : dette publique française au sens de Maastricht, par trimestre.
- Les sources et limites sont documentées dans `data/sources.json` et dans l’interface.
- Une première recherche de commune accepte le nom, le code postal et le code INSEE pour les entités présentes dans `data/entities.json` ; le catalogue est encore partiel.
- Les données financières de Fameck ne sont pas encore intégrées ni validées : aucune valeur locale n’est présentée comme vérifiée.
- Le rapprochement automatique du fichier XLSX brut de l’INSEE reste à effectuer. Les chiffres affichés doivent donc être considérés comme un prototype tant que ce contrôle n’est pas terminé.

## Publication

Le site est statique et peut être publié avec GitHub Pages depuis la branche `main`, dossier `/` (root). Aucun backend ni secret n’est requis pour ce prototype.

Important : les fichiers HTML, CSS et JavaScript exécutés dans le navigateur sont nécessairement consultables par le public. Les secrets, clés privées, outils internes, tests et documentation de développement ne doivent pas être copiés dans ce dépôt public.

## Sources

Les sources officielles et les limites de chaque série sont répertoriées dans `data/sources.json`.
