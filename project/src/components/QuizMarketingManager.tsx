import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Upload, Download, Send, BarChart2, Users, Trophy, Target, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  sendQuizToNumbers, 
  exportQuizResults, 
  getQuizStats, 
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  getQuestionTypeLabel,
  type QuizQuestion, 
  type QuizUser, 
  type QuizStats 
} from '../lib/quiz-marketing';
import { useAuth } from '../contexts/AuthContext';
import { normalizePhoneNumber } from '../lib/whatsapp';

interface QuizMarketingManagerProps {
  onClose?: () => void;
}

const QuizMarketingManager: React.FC<QuizMarketingManagerProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [users, setUsers] = useState<QuizUser[]>([]);
  const [stats, setStats] = useState<QuizStats>({
    totalParticipants: 0,
    profileBreakdown: { discovery: 0, active: 0, vip: 0 },
    averageScore: 0,
    completionRate: 0,
    latestParticipants: []
  });
  const [activeTab, setActiveTab] = useState<'questions' | 'participants' | 'send' | 'stats'>('questions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [newQuestion, setNewQuestion] = useState<Partial<QuizQuestion>>({
    text: '',
    type: 'personal',
    required: true,
    order_index: 0,
    category: 'General'
  });
  const [phoneNumbers, setPhoneNumbers] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([
        loadQuestions(),
        loadUsers(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Impossible de charger les données du quiz. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('quiz_questions')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Error loading questions:', error);
      throw new Error('Erreur lors du chargement des questions');
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('quiz_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      throw new Error('Erreur lors du chargement des participants');
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getQuizStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
      throw new Error('Erreur lors du chargement des statistiques');
    }
  };

  const handleSaveQuestion = async () => {
    try {
      setIsSavingQuestion(true);
      setError(null);
      
      if (!newQuestion.text || !newQuestion.type) {
        setError('Veuillez remplir tous les champs obligatoires');
        return;
      }

      if (editingQuestion) {
        // Update existing question
        await updateQuizQuestion(editingQuestion.id, {
          text: newQuestion.text,
          type: newQuestion.type,
          options: newQuestion.options,
          points: newQuestion.points,
          required: newQuestion.required,
          order_index: newQuestion.order_index,
          correct_answer: newQuestion.correct_answer
        });
        
        setSuccess('Question mise à jour avec succès');
      } else {
        // Create new question
        await createQuizQuestion({
          text: newQuestion.text!,
          type: newQuestion.type!,
          options: newQuestion.options,
          points: newQuestion.points,
          required: newQuestion.required!,
          order_index: newQuestion.order_index || questions.length,
          correct_answer: newQuestion.correct_answer
        });
        
        setSuccess('Question créée avec succès');
      }

      setShowQuestionEditor(false);
      setEditingQuestion(null);
      setNewQuestion({
        text: '',
        type: 'personal',
        required: true,
        order_index: 0,
        category: 'General'
      });
      
      await loadQuestions();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error saving question:', error);
      setError('Erreur lors de la sauvegarde de la question');
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette question ?')) return;

    try {
      await deleteQuizQuestion(id);
      
      setSuccess('Question supprimée avec succès');
      await loadQuestions();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting question:', error);
      setError('Erreur lors de la suppression de la question');
    }
  };

  const handleSendQuiz = async () => {
    try {
      setIsSending(true);
      setError(null);

      const numbers = phoneNumbers
        .split('\n')
        .map(num => num.trim())
        .filter(num => num.length > 0);

      if (numbers.length === 0) {
        setError('Veuillez entrer au moins un numéro de téléphone');
        return;
      }

      // Validate phone number format
      const invalidNumbers = numbers.filter(num => !num.match(/^\+?[1-9]\d{1,14}$/));
      if (invalidNumbers.length > 0) {
        setError(`Numéros de téléphone invalides: ${invalidNumbers.join(', ')}`);
        return;
      }

      await sendQuizToNumbers(numbers, user?.id);
      setSuccess(`Quiz envoyé à ${numbers.length} numéro(s)`);
      setPhoneNumbers('');
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error sending quiz:', error);
      setError(error instanceof Error ? error.message : 'Erreur lors de l\'envoi du quiz');
    } finally {
      setIsSending(false);
    }
  };

  const handleExportResults = async () => {
    try {
      const csvContent = await exportQuizResults();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `quiz_results_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setSuccess('Résultats exportés avec succès');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error exporting results:', error);
      setError('Erreur lors de l\'export des résultats');
    }
  };

  const getProfileColor = (profile: string) => {
    switch (profile) {
      case 'vip': return 'text-purple-600 bg-purple-100';
      case 'active': return 'text-green-600 bg-green-100';
      case 'discovery': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des données du quiz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white h-full flex flex-col overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-center w-full">
            <div className="inline-flex items-center gap-3 mb-2">
              <Trophy className="w-8 h-8 text-yellow-600" />
              <Target className="w-8 h-8 text-blue-600" />
              <BarChart2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Centre de Contrôle Marketing</h2>
            <p className="text-gray-600">Plateforme complète de gestion et d'analyse des quiz interactifs</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <nav className="flex -mb-px px-6">
            <button
              onClick={() => setActiveTab('questions')}
              className={`px-8 py-4 border-b-2 text-sm font-medium transition-colors ${
                activeTab === 'questions'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Edit className="w-4 h-4 inline-block mr-2" />
              Configuration Questions ({questions.length})
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`px-8 py-4 border-b-2 text-sm font-medium transition-colors ${
                activeTab === 'participants'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4 inline-block mr-2" />
              Base de Données Clients ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('send')}
              className={`px-8 py-4 border-b-2 text-sm font-medium transition-colors ${
                activeTab === 'send'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Send className="w-4 h-4 inline-block mr-2" />
              Campagne Marketing
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-8 py-4 border-b-2 text-sm font-medium transition-colors ${
                activeTab === 'stats'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart2 className="w-4 h-4 inline-block mr-2" />
              Analytics & ROI
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
      {/* Questions Tab */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Configuration des Questions Marketing</h3>
              <p className="text-sm text-gray-500 mt-1">Créez et gérez les questions de votre quiz interactif</p>
            </div>
            <button
              onClick={() => {
                setShowQuestionEditor(true);
                setEditingQuestion(null);
                setNewQuestion({
                  text: '',
                  type: 'personal',
                  required: true,
                  order_index: questions.length,
                  category: 'General'
                });
              }}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Créer une Question
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={question.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      question.type === 'personal' ? 'bg-blue-100 text-blue-800' :
                      question.type === 'preference' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {getQuestionTypeLabel(question.type)}
                    </span>
                    {question.required && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Obligatoire
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingQuestion(question);
                        setNewQuestion(question);
                        setShowQuestionEditor(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(question.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-gray-900 mb-2">{question.text}</p>
                {question.options && (
                  <div className="text-sm text-gray-600">
                    Options: {JSON.stringify(question.options)}
                  </div>
                )}
                {question.points && (
                  <div className="text-sm text-gray-600">
                    Points: {JSON.stringify(question.points)}
                  </div>
                )}
              </div>
            ))}

            {questions.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <div className="bg-gray-50 rounded-xl p-8">
                  <Edit className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune question configurée</h3>
                  <p className="text-sm text-gray-500 mb-4">Créez votre première question pour commencer le quiz marketing</p>
                  <button
                    onClick={() => {
                      setShowQuestionEditor(true);
                      setEditingQuestion(null);
                      setNewQuestion({
                        text: '',
                        type: 'personal',
                        required: true,
                        order_index: 0,
                        category: 'General'
                      });
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Créer une Question
                  </button>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700">
                      <strong>Astuce :</strong> Pour les questions de type "quiz", utilisez ce format JSON pour les points :
                    </p>
                    <code className="block mt-1 bg-white px-2 py-1 rounded text-xs text-blue-800 border">
                      {`{"correct_answer": "oui", "value": 10}`}
                    </code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Participants Tab */}
      {activeTab === 'participants' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Base de Données Clients</h3>
              <p className="text-sm text-gray-500 mt-1">Analysez les profils et comportements de vos prospects</p>
            </div>
            <button
              onClick={handleExportResults}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Exporter Données CRM
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Participant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profil
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.name || user.phone_number}
                        </div>
                        {user.name && (
                          <div className="text-sm text-gray-500">{user.phone_number}</div>
                        )}
                        {user.email && (
                          <div className="text-sm text-gray-500">{user.email}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{user.score}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getProfileColor(user.profile)}`}>
                        {user.profile.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.status === 'completed' ? 'bg-green-100 text-green-800' :
                        user.status === 'active' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {users.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <div className="bg-gray-50 rounded-xl p-8">
                <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">Aucun participant</h3>
                <p className="text-sm text-gray-500">Les participants apparaîtront ici après avoir commencé le quiz</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send Quiz Tab */}
      {activeTab === 'send' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-600 rounded-lg">
                <Send className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Lancement de Campagne Marketing</h3>
                <p className="text-gray-600">Diffusez votre quiz interactif à votre audience cible pour générer des leads qualifiés</p>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Numéros de téléphone (un par ligne)
            </label>
            <textarea
              value={phoneNumbers}
              onChange={(e) => setPhoneNumbers(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
              rows={8}
              placeholder="+221123456789&#10;+221987654321&#10;+221555666777"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Entrez les numéros au format international (+code pays + numéro)
              </p>
              {phoneNumbers && (
                <p className="text-sm font-medium text-blue-600">
                  {phoneNumbers.split('\n').filter(n => n.trim()).length} numéro(s) à traiter
                </p>
              )}
            </div>
          </div>

          {questions.length === 0 && (
            <div className="p-8 bg-yellow-50 border border-yellow-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-800 mb-1">Questions Requises</h4>
                  <p className="text-yellow-700 text-sm mb-3">
                    Aucune question disponible. Vous devez d'abord créer des questions dans l'onglet "Questions" avant de pouvoir envoyer le quiz.
                  </p>
                  <button
                    onClick={() => setActiveTab('questions')}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm"
                  >
                    <Edit className="w-4 h-4" />
                    Créer des Questions
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleSendQuiz}
            disabled={isSending || !phoneNumbers.trim() || questions.length === 0}
            className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg font-semibold text-lg"
          >
            {isSending ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Lancement de la campagne...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {questions.length === 0 ? 'Configurez d\'abord vos questions' : 'Lancer la Campagne Marketing'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-purple-600 rounded-lg">
                <BarChart2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Analytics & Retour sur Investissement</h3>
                <p className="text-gray-600">Mesurez l'efficacité de vos campagnes et optimisez vos conversions</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h4 className="font-medium text-gray-900">Total Participants</h4>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.totalParticipants}</p>
              <p className="text-xs text-blue-600 mt-1">Leads générés</p>
            </div>

            <div className="bg-green-50 rounded-xl p-6 border border-green-200">
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="w-5 h-5 text-green-600" />
                <h4 className="font-medium text-gray-900">Score Moyen</h4>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.averageScore.toFixed(1)}</p>
              <p className="text-xs text-green-600 mt-1">Engagement moyen</p>
            </div>

            <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
              <div className="flex items-center gap-3 mb-2">
                <Target className="w-5 h-5 text-purple-600" />
                <h4 className="font-medium text-gray-900">Taux de Complétion</h4>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.completionRate.toFixed(1)}%</p>
              <p className="text-xs text-purple-600 mt-1">Taux de conversion</p>
            </div>

            <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200">
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="w-5 h-5 text-yellow-600" />
                <h4 className="font-medium text-gray-900">Clients Premium</h4>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.profileBreakdown.vip}</p>
              <p className="text-xs text-yellow-600 mt-1">Prospects haute valeur</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-medium text-gray-900 mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              Segmentation Marketing Avancée
            </h4>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-6 bg-blue-50 rounded-xl border border-blue-200">
                <div className="text-4xl font-bold text-blue-600 mb-2">{stats.profileBreakdown.discovery}</div>
                <div className="text-sm font-medium text-blue-800 mb-1">DISCOVERY</div>
                <div className="text-xs text-blue-600">Prospects à développer</div>
              </div>
              <div className="text-center p-6 bg-green-50 rounded-xl border border-green-200">
                <div className="text-4xl font-bold text-green-600 mb-2">{stats.profileBreakdown.active}</div>
                <div className="text-sm font-medium text-green-800 mb-1">ACTIVE</div>
                <div className="text-xs text-green-600">Clients prêts à acheter</div>
              </div>
              <div className="text-center p-6 bg-purple-50 rounded-xl border border-purple-200">
                <div className="text-4xl font-bold text-purple-600 mb-2">{stats.profileBreakdown.vip}</div>
                <div className="text-sm font-medium text-purple-800 mb-1">VIP</div>
                <div className="text-xs text-purple-600">Clients haute valeur</div>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>

      {/* Question Editor Modal */}
      {showQuestionEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full h-full max-w-none max-h-none overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Edit className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {editingQuestion ? 'Modifier la Question' : 'Nouvelle Question'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {editingQuestion ? 'Modifiez les détails de cette question' : 'Créez une nouvelle question pour votre quiz'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowQuestionEditor(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Texte de la question
                </label>
                <textarea
                  value={newQuestion.text}
                  onChange={(e) => setNewQuestion(prev => ({ ...prev, text: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={3}
                  placeholder="Entrez votre question..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type de question
                </label>
                <select
                  value={newQuestion.type}
                  onChange={(e) => setNewQuestion(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="personal">Personnel (nom, email, adresse, profession)</option>
                  <option value="preference">Préférence (produits/services)</option>
                  <option value="quiz">Quiz (questions à points)</option>
                </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ordre d'affichage
                  </label>
                  <input
                    type="number"
                    value={newQuestion.order_index}
                    onChange={(e) => setNewQuestion(prev => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    min="0"
                  />
                </div>
              </div>

              {newQuestion.type === 'preference' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Options (JSON)
                  </label>
                  <textarea
                    value={JSON.stringify(newQuestion.options || ["Option 1", "Option 2", "Option 3"], null, 2)}
                    onChange={(e) => {
                      try {
                        const options = JSON.parse(e.target.value);
                        setNewQuestion(prev => ({ ...prev, options }));
                      } catch (error) {
                        // Invalid JSON, ignore
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                    rows={3}
                    placeholder={`["Option 1", "Option 2", "Option 3"]`}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Liste des options disponibles au format JSON
                  </p>
                </div>
              )}

              {newQuestion.type === 'quiz' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-3">Configuration Quiz</h4>
                  <div className="space-y-4">
                    <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Réponse correcte
                  </label>
                      <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_answer"
                        checked={newQuestion.correct_answer === true}
                        onChange={() => setNewQuestion(prev => ({ ...prev, correct_answer: true }))}
                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                      />
                        <span className="text-sm font-medium text-gray-700">Vrai</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_answer"
                        checked={newQuestion.correct_answer === false}
                        onChange={() => setNewQuestion(prev => ({ ...prev, correct_answer: false }))}
                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                      />
                        <span className="text-sm font-medium text-gray-700">Faux</span>
                    </label>
                  </div>
                      <p className="mt-2 text-sm text-blue-600">
                    Sélectionnez la réponse correcte pour cette question vrai/faux
                  </p>
                    </div>

                    <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Configuration des points (JSON)
                  </label>
                  <textarea
                    value={JSON.stringify(newQuestion.points || { correct_answer: '', value: 10 }, null, 2)}
                    onChange={(e) => {
                      try {
                        const points = JSON.parse(e.target.value);
                        setNewQuestion(prev => ({ ...prev, points }));
                      } catch (error) {
                        // Invalid JSON, ignore
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                    rows={3}
                    placeholder={`{"correct_answer": "oui", "value": 10}`}
                  />
                      <p className="mt-1 text-sm text-blue-600">
                        Définissez les points attribués pour cette question
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  id="required"
                  checked={newQuestion.required}
                  onChange={(e) => setNewQuestion(prev => ({ ...prev, required: e.target.checked }))}
                  className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                />
                <label htmlFor="required" className="text-sm font-medium text-gray-700">
                  Question obligatoire
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-4 p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                <button
                  onClick={() => setShowQuestionEditor(false)}
                  className="px-6 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                  disabled={isSavingQuestion}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveQuestion}
                  disabled={isSavingQuestion || !newQuestion.text || !newQuestion.type}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSavingQuestion ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingQuestion ? 'Mettre à Jour' : 'Créer la Question'}
                    </>
                  )}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

};

export default QuizMarketingManager;