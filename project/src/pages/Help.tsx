import React, { useState } from 'react';
import { Book, MessageSquare, Bot, GamepadIcon, Filter, Shield, ChevronDown, ChevronRight, Search, Briefcase, BookOpen, BarChart2, Settings, Clock, Smartphone, Send, Users, Database, Layout, CreditCard } from 'lucide-react';
import BackButton from '../components/BackButton';

const Help = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const helpSections = [
    {
      id: 'whatsapp',
      title: 'WhatsApp Business',
      icon: MessageSquare,
      color: 'blue',
      topics: [
        {
          title: 'Comment envoyer des messages en masse ?',
          content: `
1. Connectez-vous à votre compte
2. Accédez à la section WhatsApp
3. Importez votre liste de contacts (CSV/TXT)
4. Créez votre message avec les variables de personnalisation
5. Prévisualisez votre message
6. Planifiez ou envoyez immédiatement
          `
        },
        {
          title: 'Comment personnaliser mes messages ?',
          content: `
Utilisez les variables suivantes dans votre message :
- {{prenom}} : Prénom du contact
- {{nom}} : Nom du contact
- {{entreprise}} : Nom de l'entreprise
- {{date}} : Date actuelle

Exemple : "Bonjour {{prenom}}, voici votre offre personnalisée..."
          `
        },
        {
          title: 'Comment planifier mes envois ?',
          content: `
1. Créez votre message
2. Cliquez sur "Planifier l'envoi"
3. Choisissez la date et l'heure
4. Sélectionnez la fréquence si nécessaire
5. Confirmez la planification
          `
        },
        {
          title: 'Comment envoyer des médias enrichis ?',
          content: `
1. Dans l'interface de composition de message, cliquez sur "Add Media"
2. Sélectionnez le type de média (image, vidéo, PDF)
3. Choisissez votre fichier
4. Ajoutez un texte d'accompagnement si nécessaire
5. Envoyez ou planifiez votre message
          `
        }
      ]
    },
    {
      id: 'business',
      title: 'Business Automation',
      icon: Briefcase,
      color: 'orange',
      topics: [
        {
          title: 'Comment configurer les réponses automatiques ?',
          content: `
1. Accédez à la section Business
2. Cliquez sur "Add Rule" pour créer une nouvelle règle
3. Définissez les mots-clés déclencheurs (séparés par des virgules)
4. Rédigez la réponse automatique
5. Définissez la priorité de la règle (plus le chiffre est élevé, plus la priorité est haute)
6. Activez la règle en cochant "Enable this rule"
7. Cliquez sur "Save Rule"
          `
        },
        {
          title: 'Comment utiliser les variables dans les réponses automatiques ?',
          content: `
Vous pouvez utiliser les variables suivantes dans vos réponses automatiques :
- {{name}} : Nom du contact
- {{company}} : Entreprise du contact
- {{date}} : Date actuelle
- {{time}} : Heure actuelle

Ces variables seront remplacées par les informations correspondantes lors de l'envoi.
          `
        },
        {
          title: 'Comment gérer la priorité des règles ?',
          content: `
1. Chaque règle a un niveau de priorité (0-100)
2. Les règles avec une priorité plus élevée sont évaluées en premier
3. Si plusieurs règles correspondent, seule celle avec la priorité la plus élevée sera déclenchée
4. Pour modifier la priorité d'une règle existante :
   - Cliquez sur l'icône d'édition à côté de la règle
   - Modifiez la valeur de priorité
   - Enregistrez les modifications
          `
        },
        {
          title: 'Comment analyser les performances des réponses automatiques ?',
          content: `
Les statistiques de performance sont disponibles dans le tableau de bord :
- Nombre de déclenchements par règle
- Taux de réussite
- Temps de réponse moyen
- Variables les plus utilisées
- Numéros de téléphone les plus actifs

Ces données vous aident à optimiser vos règles pour une meilleure efficacité.
          `
        }
      ]
    },
    {
      id: 'chatbot',
      title: 'Service Client Automatisé',
      icon: Bot,
      color: 'green',
      topics: [
        {
          title: 'Comment configurer les réponses automatiques ?',
          content: `
1. Accédez aux paramètres du chatbot
2. Créez une nouvelle règle de réponse
3. Définissez les mots-clés déclencheurs
4. Rédigez la réponse automatique
5. Testez la configuration
6. Activez la règle
          `
        },
        {
          title: 'Comment analyser les performances du chatbot ?',
          content: `
Le tableau de bord vous montre :
- Nombre de conversations
- Taux de résolution
- Temps de réponse moyen
- Questions fréquentes
- Satisfaction client
          `
        },
        {
          title: 'Comment enrichir la base de connaissances ?',
          content: `
1. Accédez à la section "Base de connaissances"
2. Cliquez sur "Ajouter une entrée"
3. Définissez l'intention (ex: "demande_tarif")
4. Ajoutez des patterns de reconnaissance (différentes façons dont les clients peuvent poser la question)
5. Rédigez plusieurs réponses possibles (pour de la variété)
6. Enregistrez l'entrée

Le système utilisera l'IA pour faire correspondre les messages entrants avec l'intention la plus proche.
          `
        }
      ]
    },
   
    {
      id: 'quiz',
      title: 'Quiz et Sondages',
      icon: GamepadIcon,
      color: 'yellow',
      topics: [
        {
          title: 'Comment créer un nouveau quiz ?',
          content: `
1. Accédez à la section Quiz
2. Cliquez sur "Nouveau Quiz"
3. Définissez les paramètres :
   - Nom du quiz
   - Durée
   - Nombre de questions
4. Ajoutez vos questions
5. Configurez la notation
6. Publiez le quiz
          `
        },
        {
          title: 'Comment analyser les résultats ?',
          content: `
Dans le tableau de bord Quiz :
1. Sélectionnez le quiz
2. Consultez :
   - Taux de participation
   - Scores moyens
   - Questions difficiles
   - Classement des participants
          `
        },
        {
          title: 'Comment configurer un quiz récurrent ?',
          content: `
1. Lors de la création du quiz, dans la section "Programmation" :
2. Activez l'option "Quiz récurrent"
3. Définissez la fréquence (quotidienne, hebdomadaire, mensuelle)
4. Configurez l'intervalle entre les questions
5. Définissez le nombre de questions par jour
6. Choisissez la date de début et de fin

Les participants recevront automatiquement les questions selon la programmation définie.
          `
        },
        {
          title: 'Comment créer des questions de quiz ?',
          content: `
1. Accédez à la section "Questions" dans le module Quiz
2. Cliquez sur "Ajouter une question"
3. Rédigez votre question (format vrai/faux)
4. Sélectionnez la réponse correcte
5. Ajoutez une explication détaillée
6. Choisissez une catégorie
7. Définissez le niveau de difficulté
8. Enregistrez la question

Les questions seront utilisées dans les quiz en fonction de leur catégorie et niveau de difficulté.
          `
        }
      ]
    },
    {
      id: 'filtering',
      title: 'Filtrage des Numéros',
      icon: Filter,
      color: 'red',
      topics: [
        {
          title: 'Comment filtrer une liste de numéros ?',
          content: `
1. Accédez à la section Filtrage
2. Importez votre fichier (CSV/TXT)
3. Sélectionnez les options de filtrage
4. Lancez l'analyse
5. Téléchargez les résultats
          `
        },
        {
          title: 'Quels formats de fichiers sont acceptés ?',
          content: `
Formats supportés :
- CSV (séparateur virgule)
- TXT (un numéro par ligne)
- Excel (.xlsx)

Format des numéros :
- International (+XXX)
- Local (0XXXXXXXXX)
          `
        },
        {
          title: 'Comment fonctionne la vérification des numéros ?',
          content: `
Le système vérifie chaque numéro pour déterminer :
1. S'il est valide (format correct)
2. S'il est actif sur WhatsApp
3. S'il est associé à un compte business

Le processus est optimisé pour respecter les limites de l'API WhatsApp et éviter les blocages. La vérification se fait par lots pour maximiser l'efficacité.

Une fois terminé, vous obtenez une liste filtrée contenant uniquement les numéros actifs sur WhatsApp.
          `
        }
      ]
    },
    {
      id: 'dashboard',
      title: 'Tableau de Bord',
      icon: Layout,
      color: 'blue',
      topics: [
        {
          title: 'Comment interpréter les statistiques ?',
          content: `
Le tableau de bord présente plusieurs métriques clés :

1. Statistiques WhatsApp :
   - Volume de messages
   - Taux de livraison
   - Conversations actives

2. Statistiques Éducation :
   - Étudiants actifs
   - Sessions totales
   - Score moyen
   - Matières populaires

3. Statistiques Service Client :
   - Tickets traités
   - Temps de réponse
   - Satisfaction client

4. Statistiques Quiz :
   - Jeux actifs
   - Participants
   - Score moyen
   - Taux de complétion

Utilisez ces données pour optimiser vos stratégies et améliorer l'engagement.
          `
        },
        {
          title: 'Comment exporter les données ?',
          content: `
Pour exporter les données du tableau de bord :

1. Sélectionnez le module dont vous souhaitez exporter les données
2. Cliquez sur l'icône d'export en haut à droite du graphique
3. Choisissez le format d'export (CSV, Excel, PDF)
4. Définissez la période de données à exporter
5. Cliquez sur "Exporter"

Les données exportées peuvent être utilisées pour des analyses plus approfondies ou des présentations.
          `
        }
      ]
    },
    {
      id: 'security',
      title: 'Sécurité et Confidentialité',
      icon: Shield,
      color: 'purple',
      topics: [
        {
          title: 'Comment protéger mon compte ?',
          content: `
1. Utilisez un mot de passe fort
2. Activez l'authentification à deux facteurs
3. Ne partagez pas vos identifiants
4. Déconnectez-vous des appareils non utilisés
5. Vérifiez régulièrement l'activité du compte
          `
        },
        {
          title: 'Politique de confidentialité des données',
          content: `
Nous protégeons vos données :
- Chiffrement de bout en bout
- Stockage sécurisé
- Pas de partage avec des tiers
- Suppression sur demande
- Conformité RGPD
          `
        },
        {
          title: 'Comment gérer les permissions utilisateurs ?',
          content: `
Si vous êtes administrateur, vous pouvez gérer les permissions :

1. Accédez à la section "Paramètres" puis "Utilisateurs"
2. Sélectionnez l'utilisateur dont vous souhaitez modifier les permissions
3. Cochez ou décochez les modules auxquels il a accès
4. Définissez le niveau d'accès (lecture seule, modification, administration)
5. Enregistrez les modifications

Les changements prennent effet immédiatement.
          `
        }
      ]
    },
    {
      id: 'settings',
      title: 'Paramètres et Configuration',
      icon: Settings,
      color: 'gray',
      topics: [
        {
          title: 'Comment configurer WhatsApp Business API ?',
          content: `
1. Accédez à la section "Paramètres" puis "WhatsApp"
2. Renseignez les informations suivantes :
   - Access Token (obtenu depuis Facebook Developer Portal)
   - Phone Number ID
   - Webhook Secret
   - App ID et App Secret
3. Cliquez sur "Enregistrer et tester la connexion"
4. Si le test est réussi, votre configuration est active

Note : Vous devez avoir un compte Facebook Business et avoir configuré l'API WhatsApp Business au préalable.
          `
        },
        {
          title: 'Comment personnaliser l\'apparence de l\'interface ?',
          content: `
1. Accédez à la section "Paramètres" puis "Apparence"
2. Personnalisez :
   - Mode d'affichage (clair/sombre)
   - Couleur du thème (rouge, bleu, vert, violet)
   - Taille du texte (petit, normal, grand)
   - Animations (activées/réduites)
3. Les changements sont appliqués immédiatement et sauvegardés pour vos futures sessions
          `
        },
        {
          title: 'Comment gérer mon profil utilisateur ?',
          content: `
1. Accédez à la section "Paramètres" puis "Profil"
2. Vous pouvez modifier :
   - Votre photo de profil
   - Vos informations personnelles (nom, prénom)
   - Votre adresse email
   - Votre numéro de téléphone
3. Pour changer votre mot de passe, cliquez sur "Changer le mot de passe"
4. N'oubliez pas de cliquer sur "Enregistrer" pour appliquer les modifications
          `
        }
      ]
    },
    {
      id: 'payments',
      title: 'Paiements et Abonnements',
      icon: CreditCard,
      color: 'green',
      topics: [
        {
          title: 'Comment gérer mes abonnements ?',
          content: `
1. Accédez à la section "Paiements"
2. Consultez vos abonnements actifs :
   - Type d'abonnement (Éducation ou Business)
   - Date de début et de fin
   - Statut (actif, expiré, annulé)
   - Messages restants (si applicable)
3. Pour renouveler un abonnement expiré, cliquez sur "Renouveler"
4. Pour changer de forfait, accédez à la page d'abonnement correspondante
          `
        },
        {
          title: 'Comment consulter mon historique de paiements ?',
          content: `
1. Accédez à la section "Paiements"
2. Faites défiler jusqu'à "Historique des Transactions"
3. Consultez :
   - Montant payé
   - Date de paiement
   - Méthode de paiement
   - Statut de la transaction
   - ID de transaction

Les transactions sont classées par date, de la plus récente à la plus ancienne.
          `
        },
        {
          title: 'Quels modes de paiement sont acceptés ?',
          content: `
Nous acceptons les modes de paiement suivants :
- Airtel Money
- Orange Money
- Carte bancaire (Visa, Mastercard)
- Virement bancaire (pour les abonnements Business uniquement)

Pour les paiements par mobile money, vous recevrez une notification sur votre téléphone pour confirmer la transaction.
          `
        }
      ]
    },
    {
      id: 'campaigns',
      title: 'Gestion des Campagnes',
      icon: Send,
      color: 'red',
      topics: [
        {
          title: 'Comment créer une campagne marketing ?',
          content: `
1. Accédez à la section "Campagnes"
2. Cliquez sur "Nouvelle Campagne"
3. Renseignez les informations :
   - Nom de la campagne
   - Description
   - Audience cible (importez un fichier de contacts)
   - Dates de début et de fin
   - Message à envoyer (utilisez les variables pour personnaliser)
4. Prévisualisez la campagne
5. Choisissez "Enregistrer comme brouillon" ou "Planifier"

Une fois planifiée, la campagne s'exécutera automatiquement à la date prévue.
          `
        },
        {
          title: 'Comment analyser les performances d\'une campagne ?',
          content: `
Pour chaque campagne, vous pouvez consulter :
1. Taux d'envoi : pourcentage de messages envoyés avec succès
2. Taux de livraison : pourcentage de messages livrés aux destinataires
3. Taux d'ouverture : pourcentage de messages lus par les destinataires
4. Taux de clic : pourcentage de destinataires ayant cliqué sur un lien

Ces métriques vous aident à évaluer l'efficacité de vos campagnes et à les optimiser.
          `
        },
        {
          title: 'Comment segmenter mon audience ?',
          content: `
Pour une meilleure efficacité, segmentez votre audience :
1. Importez votre liste complète de contacts
2. Utilisez les filtres disponibles :
   - Par localisation
   - Par historique d'achat
   - Par niveau d'engagement
   - Par données démographiques
3. Enregistrez chaque segment comme une liste distincte
4. Créez des campagnes ciblées pour chaque segment

Une segmentation précise améliore significativement les taux de conversion.
          `
        }
      ]
    }
  ];

  const filteredSections = helpSections.filter(section =>
    section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.topics.some(topic => 
      topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      topic.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <BackButton />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Centre d'Aide</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Trouvez toutes les réponses à vos questions sur l'utilisation de nos services
          </p>
        </div>

        <div className="mb-8">
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher une aide..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {filteredSections.map((section) => (
            <div key={section.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <section.icon className={`w-6 h-6 text-${section.color}-600`} />
                  <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                </div>
                {expandedSection === section.id ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {expandedSection === section.id && (
                <div className="px-6 pb-6">
                  <div className="space-y-6">
                    {section.topics.map((topic, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">{topic.title}</h4>
                        <pre className="whitespace-pre-wrap text-gray-600 text-sm font-sans">
                          {topic.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Help;