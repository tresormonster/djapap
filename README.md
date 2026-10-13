# Meneckdem WiFi interface

Interface statique en HTML, CSS et JavaScript pour les espaces administrateur et client.

## Déploiement sur Vercel

1. Sélectionner ce dossier comme racine du projet Vercel.
2. Choisir le preset **Other** (site statique).
3. Laisser la commande de build vide et publier le contenu du dossier.
4. Ouvrir le site et se connecter. L’URL de l’API Render est définie dans `app.js`, dans la constante `API_BASE_URL`.
5. Si l’adresse de l’API change, modifier `API_BASE_URL` puis redéployer le site.
6. Ajouter l’origine exacte du domaine Vercel dans `CORS_ORIGINS` sur Render pour autoriser les appels du navigateur.

Le tableau de bord admin et celui du client partagent cette interface. Les comptes crees par l admin sont verifies a la creation; les inscriptions publiques conservent la confirmation par email et telephone.
