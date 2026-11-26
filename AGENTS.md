# Consignes pour les assistants (ChatGPT, Codex, Claude…)

Ce dépôt n'a pas encore de `CLAUDE.md` : lire `README.md` et `AUDIT-TECHNIQUE.md` avant toute modification ;
les commandes de vérification sont dans `README.md` (section Tests).

Règles communes du portefeuille (décisions de Lucas du 25/11/2026) :

1. **Jamais de commit direct sur `main`** : une branche, puis une Pull Request. Ne pas fusionner sans l'accord de Lucas.
2. **Signer son travail** : chaque commit se termine par une ligne `Co-Authored-By:` au nom de l'assistant, par exemple
   `Co-Authored-By: ChatGPT <noreply@openai.com>`. Sans elle, le commit est indiscernable du travail de Lucas.
3. **Vérifier avant d'envoyer** avec les commandes du `README.md`. Un contrôle non exécuté n'est jamais annoncé réussi ;
   une CI verte n'est pas un essai sur un vrai téléphone.
4. **GitHub Actions léger** : contrôles rapides sur les PR seulement. Pas de nouveau workflow lourd, ni de déclenchement à
   chaque push, sans accord (le quota de minutes est limité).
5. **Aucun secret** dans le dépôt (clé, mot de passe, keystore, jeton).
6. **Cartes des dossiers** : chaque dossier a un `CARTE.md` (rôle, contenu, liens). Le lire avant de travailler ;
   après avoir ajouté, déplacé ou supprimé un fichier, lancer `npm run carte`, décrire ce qui est « À décrire », et
   commiter les cartes avec le changement. `npm run carte:verifier` refuse une carte périmée.
