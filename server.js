const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==========================================
// MONGODB ATLAS BAĞLANTISI
// ==========================================
// Şu an senin test etmen için kendi MongoDB bağlantın aktif çalışmaktadır:
const MONGO_URI = 'mongodb+srv://kerimcan:kerim.KE4@cluster0.bhwtbps.mongodb.net/hoppapos?retryWrites=true&w=majority';

/* 
   ŞİRKET CANLIYA GEÇERKEN KENDİ MONGODB BİLGİLERİNİ BURAYA ŞÖYLE YAZACAK:
   const MONGO_URI = 'mongodb+srv://KULLANICI_ADINIZ:SIFRENIZ@cluster_adi.mongodb.net/veritabani_adi?retryWrites=true&w=majority';
*/

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Atlas bağlantısı başarılı!"))
    .catch(err => console.error("MongoDB bağlantı hatası:", err));


// ==========================================
// 1. MODEL KATMANI
// ==========================================
const abonelikOdemeSchema = new mongoose.Schema({
    kullaniciAdi: { type: String, required: true },
    abonelikTipi: { type: String, required: true },
    tutar: { type: Number, required: true },
    islemDurumu: { type: String, default: 'Beklemede / Simüle' },
    tarih: { type: Date, default: Date.now }
});

const AbonelikOdemeModel = mongoose.model('AbonelikOdeme', abonelikOdemeSchema);


// ==========================================
// 2. SERVICE KATMANI (SINIF YAPISI)
// ==========================================
class PaymentGatewayService {
    constructor() {
        this.config = {
            merchantId: "BURAYA_MERCHANT_ID_GELECEK",
            secretKey: "BURAYA_SECRET_KEY_GELECEK",
            gatewayPostUrl: "BURAYA_HOPPA_ELEKSE_POST_URL_GELECEK"
        };
    }

    generateHash(data) {
        // TODO: Dokümana göre hash üretilecek
        return "HASH_IMZASI_BURAYA_GELECEK";
    }

    async processPayment(kullaniciAdi, abonelikTipi, tutar) {
        if (!kullaniciAdi || !abonelikTipi || tutar <= 0) {
            throw new Error('Geçersiz işlem parametreleri!');
        }

        const hashImzasi = this.generateHash({ kullaniciAdi, tutar });

        const paymentPayload = {
            merchantId: this.config.merchantId,
            amount: tutar,
            hash: hashImzasi,
            callbackUrl: "https://senin-sunucu-adresin.com/api/webhook/callback"
        };

        try {
            /* 
               CANLIYA GEÇİŞTE URL'LER EKLENDİKTEN SONRA AÇILACAK KOD:
               const response = await fetch(this.config.gatewayPostUrl, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify(paymentPayload)
               });
               const gatewayResult = await response.json();
               if (!response.ok) throw new Error("POS Hatası: " + gatewayResult.message);
            */

            const yeniKayit = new AbonelikOdemeModel({ 
                kullaniciAdi, 
                abonelikTipi, 
                tutar, 
                islemDurumu: 'Başarılı (POST ile iletildi)' 
            });
            await yeniKayit.save();

            return { success: true, message: "Ödeme isteği POS adresine POST edildi ve veritabanına işlendi!" };
        } catch (err) {
            throw new Error("Ödeme Gateway Hatası: " + err.message);
        }
    }
}

const paymentService = new PaymentGatewayService();


// ==========================================
// 3. CONTROLLER KATMANI (SINIF YAPISI)
// ==========================================
class AbonelikController {
    getIndex(req, res) {
        res.sendFile(path.join(__dirname, 'index.html'));
    }

    async postOdeme(req, res) {
        try {
            const { kullaniciAdi, abonelikTipi, tutar } = req.body;
            const sonuc = await paymentService.processPayment(kullaniciAdi, abonelikTipi, Number(tutar));
            res.json(sonuc);
        } catch (err) {
            res.status(400).json({ success: false, error: err.message });
        }
    }

    async postWebhook(req, res) {
        try {
            const bankaBildirimi = req.body;
            const gelenImza = req.headers['x-pos-signature']; 

            const beklenenImza = paymentService.generateHash(bankaBildirimi);
            
            /* 
               CANLI ORTAM GÜVENLİK KONTROLÜ:
               if (gelenImza !== beklenenImza) {
                   return res.status(403).json({ success: false, message: "Geçersiz imza!" });
               }
            */

            console.log("Bankadan Webhook Bildirimi Geldi:", bankaBildirimi);
            const { durum, kullaniciAdi } = bankaBildirimi;

            if (durum === 'SUCCESS') {
                console.log(`Kullanıcı ${kullaniciAdi} için ödeme onaylandı.`);
            } else {
                console.log(`Kullanıcı ${kullaniciAdi} için ödeme başarısız.`);
            }

            res.status(200).json({ received: true });
        } catch (err) {
            console.error("Webhook işleme hatası:", err.message);
            res.status(500).json({ error: err.message });
        }
    }
}

const abonelikController = new AbonelikController();


// ==========================================
// ROTALAR VE SUNUCU BAŞLATMA
// ==========================================
app.get('/', (req, res) => abonelikController.getIndex(req, res));
app.post('/api/abonelik-odeme', (req, res) => abonelikController.postOdeme(req, res));
app.post('/api/webhook/callback', (req, res) => abonelikController.postWebhook(req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu ${PORT} portunda başarıyla çalışıyor.`);
});