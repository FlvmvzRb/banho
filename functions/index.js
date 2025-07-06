const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// --- Configurações da API do WhatsApp ---
// IMPORTANTE: Substitua os valores abaixo pelos dados do seu provedor de API.
const WHATSAPP_API_URL = "URL_DA_SUA_API_WHATSAPP_AQUI"; // Ex: https://api.seuservico.com/v1/messages
const WHATSAPP_API_KEY = "SUA_CHAVE_SECRETA_DA_API_AQUI"; // Ex: "Bearer sk_12345abcdef..."

// Gatilho do Firestore: executa sempre que um agendamento é atualizado.
exports.enviarNotificacaoWhatsApp = functions.region('southamerica-east1')
    .firestore.document("artifacts/{appId}/public/data/appointments/{appointmentId}")
    .onUpdate(async (change, context) => {
        
        const dadosAnteriores = change.before.data();
        const dadosNovos = change.after.data();

        // Condição de execução: O status deve ter MUDADO para "Finalizado".
        const foiFinalizado = dadosNovos.status === "Finalizado" && dadosAnteriores.status !== "Finalizado";
        
        // Se não foi finalizado agora, ou não tem telefone, ou é Taxi Dog, a função para.
        if (!foiFinalizado) {
            console.log("Gatilho ignorado: Status não mudou para Finalizado.");
            return null;
        }
        if (dadosNovos.services && dadosNovos.services.includes('Taxi Dog')) {
            console.log(`É Taxi Dog (${dadosNovos.petName}), não precisa notificar.`);
            return change.after.ref.update({ notifiedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        if (!dadosNovos.tutorPhone) {
            console.log(`Sem telefone para notificar ${dadosNovos.petName}.`);
            return null;
        }

        console.log(`Iniciando notificação para o pet: ${dadosNovos.petName}`);

        // 1. Prepara a mensagem personalizada
        const cleanedPhone = dadosNovos.tutorPhone.replace(/\D/g, '');
        let petGreeting = "o mocinho(a)";
        let verb = "finalizou o banho e está";

        if (dadosNovos.petName && (dadosNovos.petName.includes('/') || dadosNovos.petName.includes('-'))) {
            petGreeting = "os mocinhos(as)";
            verb = "finalizaram o banho e estão";
        } else if (dadosNovos.petSex === 'Macho') {
            petGreeting = "o mocinho";
        } else if (dadosNovos.petSex === 'Femea') {
            petGreeting = "a mocinha";
        }
        
        const messageText = `Olá, aqui é a assistente virtual do Empório Pet 😄! Estou passando para avisar que ${petGreeting} já ${verb} aguardando por você! 🥰🥰`;

        // 2. Envia a mensagem usando a API do WhatsApp
        try {
            // Este é um exemplo genérico de chamada. Você precisará adaptar
            // para o formato exato que o seu provedor de API exigir.
            await axios.post(WHATSAPP_API_URL, {
                to: `+55${cleanedPhone}`, // Formato internacional
                message: messageText,
            }, {
                headers: {
                    'Authorization': WHATSAPP_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`Mensagem enviada com sucesso para 55${cleanedPhone}`);

            // 3. Atualiza o card para "Avisado" no banco de dados
            return change.after.ref.update({
                notifiedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error(`Erro ao enviar mensagem via API do WhatsApp para ${cleanedPhone}:`, error.response ? error.response.data : error.message);
            // Retorna null para não tentar novamente em caso de erro.
            // Você pode adicionar lógicas mais complexas aqui, como salvar o erro no Firestore.
            return null;
        }
    });
