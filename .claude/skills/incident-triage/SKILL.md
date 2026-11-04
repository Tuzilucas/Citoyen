---
name: incident-triage
description: Diagnostiquer et corriger un incident sur n'importe quel projet issu d'un moule STRUCTURE-PROJET (fonctionnalité cassée, donnée erronée publiée, déploiement en échec, contrôle ou crochet qui bloque, faille signalée) avec reproduction, test de non-régression et entrée dans ERROR_LOG.md. À utiliser dès que l'utilisateur signale que quelque chose ne marche pas ou qu'une erreur est en ligne.
---

# Traiter un incident

Version générique du socle. Les commandes et procédures propres au projet sont dans son `CLAUDE.md` (sections « Commandes » et « Règles non négociables ») et, s'il existe, dans `docs/RUNBOOK.md` (mise en ligne, retour arrière).

1. **Classer** : composant (donnée ou contenu, interface, logique, base de données, sécurité, déploiement, outillage), gravité :
   - critique : information fausse ou donnée personnelle en ligne, faille exploitable, service indisponible ;
   - haute : fonctionnalité principale cassée ;
   - moyenne : contournement possible ;
   - faible : gêne mineure.
2. **Mesure immédiate si critique** : retirer ou masquer l'élément fautif, ou revenir à la version précédente selon `docs/RUNBOOK.md`. Dire clairement à l'utilisateur ce qu'il doit faire lui-même (exécuter un SQL, désactiver un lien de paiement, révoquer une clé…).
3. **Chercher** un cas similaire dans `ERROR_LOG.md` et dans les leçons apprises du moule d'origine.
4. **Reproduire** avec la commande minimale : `npm run check` d'abord, puis l'outil ciblé listé dans `CLAUDE.md` (build, audit d'affichage, tests SQL…), capture d'écran si c'est visuel. Noter la sortie exacte ; ne jamais supposer un résultat.
5. **Écrire le test qui échoue** (fichier de tests du projet) ou le contrôle qui l'aurait attrapé (script appelé par `npm run check`), et constater qu'il échoue avant la correction.
6. **Corriger** de façon ciblée, puis `npm run check` (0 erreur) et `npm run verifier` (ce que lance le crochet `.githooks/pre-push`), plus l'audit d'affichage si une page ou un écran est touché.
7. **Consigner** une ligne dans `ERROR_LOG.md` : `INC-NNN`, date, composant, gravité, description, cause (ou hypothèse signalée comme telle), correctif, statut. Jamais « résolu » avant que les vérifications passent.
8. **Reporter au moule** si la parade est réutilisable : leçon apprise et test ou contrôle (skill `feed-structure`).

Interdit : désactiver un test ou un contrôle pour débloquer ; pousser avec `git push --no-verify` pour faire passer un correctif ; mettre un secret ou une donnée personnelle dans le journal ou dans un test.
