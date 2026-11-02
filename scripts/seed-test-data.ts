/**
 * Test ortamı örnek verisi (iş listesi #2):
 *  - Fiat Egea, Renault Clio, Toyota Corolla, Hyundai i20, VW Passat'tan birer alt model
 *  - her birine 12-18 yorum (farklı puan, km, konu, kategori puanı, tavsiye, kullanım süresi)
 *  - 1-3 puanlı yorumlardaki konulardan 2-4 kronik sorun, en az biri `high`
 *  - rastgele beğeniler (kendi yorumuna değil)
 *  - bu 5 araçta fuel/transmission/body alanları elle set edilir
 *
 * Idempotent: seed kullanıcıları (seed+N@nedersin.test) ve onların yorumları
 * zaten varsa yeniden eklenmez. Gerçek kullanıcıların verisine dokunmaz.
 *
 *   npm run seed:test-data
 */
import * as bcrypt from 'bcryptjs';
import { createClient } from './db';
import { buildSearchText } from '../src/common/utils/turkish';

type Topic =
  | 'Motor'
  | 'Konfor'
  | 'Yakıt'
  | 'Şanzıman'
  | 'Klima'
  | 'Servis'
  | 'Güvenlik'
  | 'Fiyat/Değer';
type Usage = '0-3m' | '3-12m' | '1-3y' | '3y+';

interface SeedReview {
  title: string;
  content: string;
  rating: 1 | 2 | 3 | 4 | 5;
  km: number;
  topics: Topic[];
  usage: Usage;
}

interface SeedCar {
  brand: string;
  model: string;
  /** Sırayla denenir; ilk eşleşen alt model kullanılır. */
  prefer: RegExp[];
  specs: { fuelType: string; transmission: string; bodyType: string };
  /** Kategori puanı sapmaları (araç karakteri). */
  bias: Partial<Record<(typeof CATEGORY_KEYS)[number], number>>;
  reviews: SeedReview[];
}

const SEED_PASSWORD = 'Seed1234';
const SEED_USERS: [string, string][] = [
  ['Mehmet', 'Kaya'],
  ['Ayşe', 'Demir'],
  ['Emre', 'Çelik'],
  ['Zeynep', 'Şahin'],
  ['Burak', 'Yıldız'],
  ['Elif', 'Aydın'],
  ['Can', 'Öztürk'],
  ['Selin', 'Arslan'],
  ['Murat', 'Doğan'],
  ['Deniz', 'Kılıç'],
  ['Hakan', 'Aslan'],
  ['Merve', 'Çetin'],
  ['Oğuz', 'Kara'],
  ['Esra', 'Koç'],
  ['Serkan', 'Kurt'],
  ['Gizem', 'Özdemir'],
  ['Tolga', 'Şimşek'],
  ['Nur', 'Polat'],
  ['Kerem', 'Erdoğan'],
  ['Büşra', 'Yalçın'],
];

// Kategori puanları: genel puan + araca özgü karakter + küçük sapma
const CATEGORY_KEYS = [
  'comfort',
  'interior',
  'performance',
  'value',
  'exterior',
  'reliability',
] as const;
function categoryRatings(
  rating: number,
  seed: number,
  bias: Record<string, number>,
) {
  const out: Record<string, number> = {};
  CATEGORY_KEYS.forEach((k, i) => {
    const jitter = ((seed * 7 + i * 5) % 3) - 1; // -1, 0, +1
    const v = Math.round(rating + (bias[k] ?? 0) + jitter * 0.6);
    out[k] = Math.min(5, Math.max(1, v));
  });
  return out;
}

const CARS: SeedCar[] = [
  {
    brand: 'Fiat',
    model: 'Egea',
    prefer: [
      /^Egea \(356\) · 1\.3 Multijet II \(95 bg\) 2016 - 2019$/,
      /Egea \(356\) · 1\.3 Multijet/,
      /Egea/,
    ],
    specs: { fuelType: 'diesel', transmission: 'manual', bodyType: 'sedan' },
    bias: {
      value: 1.2,
      comfort: 0.4,
      interior: -0.8,
      performance: -0.6,
      exterior: 0.2,
      reliability: -0.7,
    },
    reviews: [
      {
        title: 'Ekonomik ama şanzıman sorunlu',
        content:
          '1.3 Multijet motor yakıtta gerçekten cimri, şehir içi 5 litreyi geçmiyor. Ancak 60 bin km civarında şanzıman vites geçişlerinde sertleşme başladı, serviste debriyaj seti değişti.',
        rating: 3,
        km: 85000,
        topics: ['Yakıt', 'Şanzıman'],
        usage: '3y+',
      },
      {
        title: 'Fiyatına göre çok iyi',
        content:
          'Bu paraya bu kadar geniş ve ekonomik başka sedan yok. Bagaj devasa, arka koltuklar rahat. Plastik kalitesi düşük ama beklentim de o kadardı.',
        rating: 4,
        km: 42000,
        topics: ['Fiyat/Değer', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Şanzıman titremesi',
        content:
          'Kalkışlarda şanzımandan gelen titreme ve ikinci viteste takılma var. İki kez servise gittim, yazılım güncellemesi dediler ama sorun devam ediyor.',
        rating: 2,
        km: 61000,
        topics: ['Şanzıman', 'Servis'],
        usage: '1-3y',
      },
      {
        title: 'Uzun yolda konforlu',
        content:
          'İstanbul-Antalya gidiş dönüş yaptım, bel ağrısı olmadı. Süspansiyon yumuşak, kasislerde sesi az. Motor 95 beygir ama tork sayesinde yeterli.',
        rating: 4,
        km: 120000,
        topics: ['Konfor', 'Motor'],
        usage: '3y+',
      },
      {
        title: 'Klima zayıf',
        content:
          'Yaz aylarında klima arka koltukları soğutmakta zorlanıyor. Kompresör devreye girince motor gücünde belirgin düşüş oluyor. Onun dışında dizel ekonomisi harika.',
        rating: 3,
        km: 55000,
        topics: ['Klima', 'Yakıt'],
        usage: '1-3y',
      },
      {
        title: 'Servis fiyatları makul',
        content:
          'Yetkili servis bakım ücretleri rakiplere göre uygun. Parça bulunurluğu kolay. 100 bin km bakımında hiçbir ekstra masraf çıkmadı.',
        rating: 5,
        km: 101000,
        topics: ['Servis', 'Fiyat/Değer'],
        usage: '3y+',
      },
      {
        title: 'Şanzıman yağı değişti, düzelmedi',
        content:
          'Vites geçişlerinde ses ve sertlik şikayetiyle gittim, şanzıman yağı değiştirildi. Bir süre iyiydi, 5 bin km sonra aynı sorun geri geldi. Egea sahiplerinde yaygın sorun galiba.',
        rating: 2,
        km: 73000,
        topics: ['Şanzıman'],
        usage: '1-3y',
      },
      {
        title: 'Aile aracı olarak ideal',
        content:
          'Çocuk koltuğu rahat takılıyor, Isofix bağlantıları erişilebilir. Bagaja bebek arabası ve valizler aynı anda sığıyor. Yakıt tüketimi 4.8 litre civarı seyrediyor.',
        rating: 5,
        km: 38000,
        topics: ['Konfor', 'Yakıt', 'Güvenlik'],
        usage: '1-3y',
      },
      {
        title: 'Motor sesi içeri geliyor',
        content:
          'Dizel motorun sesi kabinde fazla hissediliyor, özellikle soğuk çalıştırmada. Ses yalıtımı zayıf. Vites kolunda titreme var. Yine de tüketim yüzünden tavsiye ederim.',
        rating: 3,
        km: 47000,
        topics: ['Motor', 'Konfor'],
        usage: '3-12m',
      },
      {
        title: 'Şanzıman arızası garanti dışı',
        content:
          'Şanzıman çatalı kırıldı ve garanti süresi bittiği için 9 bin lira ödedim. Servis bu sorunun 1.3 Multijet manuel şanzımanda sık görüldüğünü söyledi.',
        rating: 1,
        km: 132000,
        topics: ['Şanzıman', 'Servis', 'Fiyat/Değer'],
        usage: '3y+',
      },
      {
        title: 'Dengeli bir araç',
        content:
          'Ne çok iyi ne çok kötü. Yakıt tüketimi en büyük artısı. Direksiyon hissiyatı düşük, iç mekan plastikleri ses yapıyor. Güvenlik donanımı yeterli.',
        rating: 3,
        km: 66000,
        topics: ['Yakıt', 'Güvenlik'],
        usage: '1-3y',
      },
      {
        title: 'Tüketim efsane',
        content:
          'Şehir dışında 3.9 litre gördüm, inanılmaz. Motor sakin devirde çok ekonomik. Hız yapmak isteyenlere değil, mantıklı kullananlara göre bir araç.',
        rating: 5,
        km: 29000,
        topics: ['Yakıt', 'Motor'],
        usage: '3-12m',
      },
      {
        title: 'Klima gazı iki kez kaçtı',
        content:
          'İki yaz üst üste klima gazı bitti, servis kaçak buldu ve hortum değiştirdi. Şanzımanda da hafif sertlik var. Bunlar dışında memnunum.',
        rating: 3,
        km: 58000,
        topics: ['Klima', 'Şanzıman'],
        usage: '1-3y',
      },
      {
        title: 'İkinci el değeri yüksek',
        content:
          'Üç yıl kullandım, aldığım fiyatın çok azına sattım sayılır. Değer kaybı çok düşük. Yakıt ve bakım masrafı da düşüktü. Egea gerçekten mantıklı tercih.',
        rating: 4,
        km: 92000,
        topics: ['Fiyat/Değer'],
        usage: '3y+',
      },
      {
        title: 'Vites geçişleri zor',
        content:
          'Özellikle soğuk havalarda geri vitese geçmek ciddi efor istiyor. Üçüncü vites bazen takılıyor. Debriyaj hissi belirsiz. Egea şanzımanı bence en zayıf noktası.',
        rating: 2,
        km: 44000,
        topics: ['Şanzıman'],
        usage: '1-3y',
      },
    ],
  },
  {
    brand: 'Renault',
    model: 'Clio',
    prefer: [
      /^Clio V \(Phase I\) · 1\.0 TCe \(100 bg\) 2019/,
      /Clio V \(Phase I\) · 1\.0 TCe/,
      /Clio V/,
      /Clio/,
    ],
    specs: {
      fuelType: 'gasoline',
      transmission: 'manual',
      bodyType: 'hatchback',
    },
    bias: {
      interior: 1.1,
      exterior: 1.0,
      value: -0.6,
      performance: -0.2,
      reliability: -0.7,
      comfort: 0.2,
    },
    reviews: [
      {
        title: 'Şehir için biçilmiş kaftan',
        content:
          'Küçük, çevik, park etmesi kolay. 1.0 TCe motor şehir içinde yeterli, 100 beygir rakamı yanıltmasın, torku iyi. İç mekan tasarımı sınıfının en iyisi.',
        rating: 5,
        km: 24000,
        topics: ['Motor', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Yakıt beklediğimden yüksek',
        content:
          'Katalogda 5 litre yazıyor ama şehir içinde 7.5 litrenin altına inemiyorum. Turbo benzinli motorlar sakin kullanılmazsa yakıyor. Onun dışında araç güzel.',
        rating: 3,
        km: 31000,
        topics: ['Yakıt'],
        usage: '3-12m',
      },
      {
        title: 'Multimedya donuyor',
        content:
          'Easy Link ekranı haftada bir donuyor, Android Auto bağlantısı kopuyor. Servis yazılım güncelledi, düzelmedi. Sürüş olarak çok memnunum ama bu can sıkıcı.',
        rating: 3,
        km: 18000,
        topics: ['Servis', 'Konfor'],
        usage: '3-12m',
      },
      {
        title: 'Motor titremesi ve çekiş kaybı',
        content:
          'Rölantide motor titriyor ve bazen gaz tepkisi gecikiyor. Servis bobin ve buji değiştirdi, kısmen düzeldi. 1.0 TCe motorda bu sorunu yaşayan başkaları da var.',
        rating: 2,
        km: 46000,
        topics: ['Motor', 'Servis'],
        usage: '1-3y',
      },
      {
        title: 'Güvenlik donanımı tam',
        content:
          'Şerit takip, acil fren, kör nokta uyarısı hepsi var ve iyi çalışıyor. Koltuklar uzun yolda bile rahat. Arka koltuk dar ama hatchback için normal.',
        rating: 4,
        km: 52000,
        topics: ['Güvenlik', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Fiyatı artık çok yüksek',
        content:
          'Araç olarak iyi ama sıfır fiyatı absürt seviyelere geldi. Bu paraya bir üst sınıf alınabilir. İkinci el piyasası da şişmiş durumda.',
        rating: 3,
        km: 12000,
        topics: ['Fiyat/Değer'],
        usage: '0-3m',
      },
      {
        title: 'Motor arızası 40 binde',
        content:
          'Motor arıza lambası yandı, servis zamanlama zinciri gerginliği sorunu dedi. Garanti kapsamında değişti ama 3 hafta araçsız kaldım. Güven sarsıldı.',
        rating: 1,
        km: 40000,
        topics: ['Motor', 'Servis'],
        usage: '1-3y',
      },
      {
        title: 'Çok beğendim',
        content:
          'İlk arabam ve çok keyif alıyorum. Direksiyon hafif, görüş iyi, LED farlar gece harika. Tüketim benim kullanımımda 6 litre. Tavsiye ederim.',
        rating: 5,
        km: 9000,
        topics: ['Konfor', 'Yakıt'],
        usage: '0-3m',
      },
      {
        title: 'Klima gürültülü',
        content:
          'Klima fanı en düşük kademede bile belirgin ses yapıyor. Soğutma performansı iyi ama ses rahatsız edici. Yol tutuşu ve fren güven veriyor.',
        rating: 4,
        km: 27000,
        topics: ['Klima', 'Güvenlik'],
        usage: '3-12m',
      },
      {
        title: 'Motor yağ eksiltiyor',
        content:
          "10 bin km'de 1 litre yağ eksiltiyor. Servis normal sınırlarda dedi ama bana normal gelmiyor. Turbo motorlarda yaygın deniyor. Bunun dışında şikayetim yok.",
        rating: 3,
        km: 35000,
        topics: ['Motor'],
        usage: '1-3y',
      },
      {
        title: 'Tasarım harikası',
        content:
          'Dış tasarım ve iç mekan bu sınıfta rakipsiz. Dijital gösterge paneli, ambiyans aydınlatma premium hissi veriyor. Sürüş dinamikleri de keyifli.',
        rating: 5,
        km: 15000,
        topics: ['Konfor'],
        usage: '3-12m',
      },
      {
        title: 'Servis randevu bulmak zor',
        content:
          'Yetkili serviste randevu 3 hafta sonraya veriliyor. Bakım fiyatları da yükseldi. Araç kendisi sorunsuz ama servis deneyimi kötü.',
        rating: 3,
        km: 60000,
        topics: ['Servis'],
        usage: '1-3y',
      },
      {
        title: 'Motor sesi değişti',
        content:
          'Son aylarda motordan metalik bir ses gelmeye başladı, özellikle soğukken. Serviste inceleme devam ediyor. Daha önce çok memnundum, şimdi tedirginim.',
        rating: 2,
        km: 58000,
        topics: ['Motor'],
        usage: '1-3y',
      },
      {
        title: 'Uzun yol için küçük',
        content:
          'Şehir içi için çok iyi ama uzun yolda rüzgar sesi ve küçük bagaj sorun oluyor. Yakıt tüketimi otoyolda 5.5 litre, bu güzel. Dengeli bir araç.',
        rating: 4,
        km: 70000,
        topics: ['Konfor', 'Yakıt'],
        usage: '3y+',
      },
    ],
  },
  {
    brand: 'Toyota',
    model: 'Corolla',
    prefer: [
      /^Corolla XII \(E210, facelift 2022\) · 1\.8 \(140 bg\) Hybrid e-CVT 2023$/,
      /Corolla XII .*1\.8 .*Hybrid/,
      /Corolla XII/,
      /Corolla/,
    ],
    specs: { fuelType: 'hybrid', transmission: 'automatic', bodyType: 'sedan' },
    bias: {
      reliability: 1.3,
      value: -0.5,
      performance: -0.9,
      comfort: 0.6,
      interior: -0.3,
      exterior: 0.1,
    },
    reviews: [
      {
        title: 'Hibrit sistem mükemmel',
        content:
          'Şehir içinde 4.2 litre tüketim, elektrik moduna sık geçiyor. Sessiz, sarsıntısız. Toyota güvenilirliği hissediliyor. Değer kaybı da çok düşük.',
        rating: 5,
        km: 32000,
        topics: ['Yakıt', 'Motor'],
        usage: '1-3y',
      },
      {
        title: 'e-CVT uğultusu',
        content:
          'Sert hızlanmalarda e-CVT şanzıman motoru yüksek devirde tutuyor ve uğultu rahatsız edici. Sakin kullanımda sorun yok. Konfor ve sessizlik şehir içinde üst düzey.',
        rating: 4,
        km: 21000,
        topics: ['Şanzıman', 'Konfor'],
        usage: '3-12m',
      },
      {
        title: 'Fiyatı yüksek ama değer',
        content:
          'Pahalı bir araç ancak yakıt tasarrufu ve neredeyse sıfır arıza riski bunu telafi ediyor. 5 yıl garanti güven veriyor. İç mekan malzemeleri daha iyi olabilirdi.',
        rating: 4,
        km: 45000,
        topics: ['Fiyat/Değer', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Klima petekleri koku yaptı',
        content:
          'İkinci yazda klimadan küf kokusu gelmeye başladı. Servis petek temizliği yaptı ve kabin filtresi değişti, düzeldi. Hibrit sistem kusursuz çalışıyor.',
        rating: 4,
        km: 38000,
        topics: ['Klima'],
        usage: '1-3y',
      },
      {
        title: 'Sürüş keyfi yok',
        content:
          'Çok ekonomik ve güvenilir ama sürüş hissi tamamen yok. Direksiyon boş, hızlanma isteksiz. Ulaşım aracı arayana ideal, sürüş sevene değil.',
        rating: 3,
        km: 27000,
        topics: ['Motor', 'Konfor'],
        usage: '3-12m',
      },
      {
        title: 'Servis fiyatları yüksek',
        content:
          'Yetkili servis bakım ücretleri rakiplerinin neredeyse iki katı. Hibrit batarya kontrolü için ekstra ücret istiyorlar. Araç sorunsuz ama servis maliyeti düşündürüyor.',
        rating: 3,
        km: 60000,
        topics: ['Servis', 'Fiyat/Değer'],
        usage: '3y+',
      },
      {
        title: 'Güvenlik paketi çok iyi',
        content:
          'Toyota Safety Sense adaptif hız sabitleyici ve şerit merkezleme otoyolda büyük konfor. Otomatik fren bir kez beni kazadan kurtardı. Kesinlikle öneririm.',
        rating: 5,
        km: 50000,
        topics: ['Güvenlik', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Arka koltuk dar',
        content:
          'Sedan için arka diz mesafesi ve kafa mesafesi beklediğimden az. Bagaj hibrit bataryası yüzünden küçülmüş. Yakıt tüketimi 4.5 litre, bu tarafı çok iyi.',
        rating: 3,
        km: 16000,
        topics: ['Konfor', 'Yakıt'],
        usage: '3-12m',
      },
      {
        title: 'Sorunsuz 100 bin km',
        content:
          '100 bin kilometreyi arızasız devirdim, sadece periyodik bakım ve lastik. Fren balataları bile rejeneratif frenleme sayesinde hâlâ orijinal. Harika araç.',
        rating: 5,
        km: 103000,
        topics: ['Motor', 'Servis'],
        usage: '3y+',
      },
      {
        title: 'Şanzıman tepkisi geç',
        content:
          'Sollamalarda gaz verdiğimde e-CVT geç tepki veriyor ve motor bağırıyor. Spor moda alsam da çok fark etmiyor. Sakin sürüşte kusursuz ama tepki beklemeyin.',
        rating: 3,
        km: 34000,
        topics: ['Şanzıman', 'Motor'],
        usage: '1-3y',
      },
      {
        title: '12V akü bitti',
        content:
          'Hibrit sistemin yanında küçük 12V akü var ve 2 yılda bitti, araç açılmadı. Servis garanti kapsamında değiştirdi. Bu modelde sık görülen bir durum olduğunu söylediler.',
        rating: 3,
        km: 29000,
        topics: ['Servis', 'Motor'],
        usage: '1-3y',
      },
      {
        title: 'Uzun yol arkadaşı',
        content:
          'Otoyolda 110 km/s sabit hızda 4.8 litre. Koltuklar rahat, kabin sessiz, adaptif cruise yorulmayı önlüyor. Ailemle 2000 km yol yaptık, hiç yorulmadık.',
        rating: 5,
        km: 41000,
        topics: ['Yakıt', 'Konfor', 'Güvenlik'],
        usage: '1-3y',
      },
      {
        title: 'Multimedya eski kaldı',
        content:
          'Ekran tepkisiz ve arayüz eski. Kablosuz Apple CarPlay yok. Bu fiyattaki bir araçta beklenmezdi. Mekanik olarak ise mükemmel, hiçbir sorun yaşamadım.',
        rating: 4,
        km: 22000,
        topics: ['Konfor'],
        usage: '3-12m',
      },
    ],
  },
  {
    brand: 'Hyundai',
    model: 'i20',
    prefer: [
      /^i20 III \(facelift 2023\) · 1\.0 T-GDi \(100 bg\) DCT 2023$/,
      /i20 III .*1\.0 T-GDi .*DCT/,
      /i20 III/,
      /i20/,
    ],
    specs: {
      fuelType: 'gasoline',
      transmission: 'automatic',
      bodyType: 'hatchback',
    },
    bias: {
      exterior: 1.0,
      interior: 0.8,
      value: 0.7,
      reliability: -1.0,
      comfort: -0.5,
      performance: 0.1,
    },
    reviews: [
      {
        title: 'DCT şanzıman kalkışta sarsıyor',
        content:
          'Çift kavramalı şanzıman kalkışlarda ve düşük hızlarda sarsıntı yapıyor, rampa kalkışında debriyaj kokusu alıyorum. Servis normal dedi. Donanım ve tasarım çok iyi.',
        rating: 3,
        km: 19000,
        topics: ['Şanzıman', 'Servis'],
        usage: '3-12m',
      },
      {
        title: 'Donanımı dolu',
        content:
          'Bu fiyata dijital gösterge, büyük ekran, kablosuz şarj, kör nokta uyarısı. Rakiplerinde bunlar opsiyon. Motor 100 beygir ama turbo sayesinde canlı.',
        rating: 5,
        km: 11000,
        topics: ['Fiyat/Değer', 'Motor'],
        usage: '0-3m',
      },
      {
        title: 'Şanzıman arızası',
        content:
          "25 bin km'de DCT şanzıman arıza verdi, araç yürümedi. Servis mekatronik ünitesini garanti kapsamında değiştirdi, 1 ay sürdü. Kullanım sonrası tekrarlamadı ama güvenim azaldı.",
        rating: 2,
        km: 31000,
        topics: ['Şanzıman', 'Servis'],
        usage: '1-3y',
      },
      {
        title: 'Yakıt tüketimi iyi',
        content:
          'Şehir içi 6.5, uzun yol 5 litre. Hız sabitleyici ile otoyolda çok rahat. Koltuk desteği zayıf, uzun yolda sırt ağrısı yapıyor.',
        rating: 4,
        km: 42000,
        topics: ['Yakıt', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Ses yalıtımı zayıf',
        content:
          'Otoyolda rüzgar ve lastik sesi kabine fazla giriyor. Plastik malzemeler sert. Bunun dışında sürüşü keyifli, direksiyon doğrudan.',
        rating: 3,
        km: 23000,
        topics: ['Konfor'],
        usage: '3-12m',
      },
      {
        title: 'Şanzımanda tereddüt',
        content:
          'Dönüşlerde yavaşlayıp tekrar gaz verdiğimde şanzıman 1-2 saniye kararsız kalıyor. Trafikte stresli. Spor moddayken biraz daha iyi. Dijital kokpit ve farlar süper.',
        rating: 3,
        km: 15000,
        topics: ['Şanzıman'],
        usage: '3-12m',
      },
      {
        title: '5 yıl garanti güven veriyor',
        content:
          'Hyundai garantisi ve servis ağı rahatlatıcı. Bakım fiyatları uygun. Aracın yol tutuşu ve fren performansı sınıf ortalamasının üzerinde.',
        rating: 4,
        km: 36000,
        topics: ['Servis', 'Güvenlik'],
        usage: '1-3y',
      },
      {
        title: 'Klima çok iyi soğutuyor',
        content:
          'Antalya sıcağında bile klima saniyeler içinde kabini soğutuyor. Otomatik klima dengeli çalışıyor. Yakıt tüketimi klima açıkken 7 litreye çıkıyor ama kabul edilebilir.',
        rating: 5,
        km: 28000,
        topics: ['Klima', 'Yakıt'],
        usage: '1-3y',
      },
      {
        title: 'Şanzıman yazılımı güncellendi',
        content:
          'Sarsıntı şikayetiyle gittim, DCT yazılımı güncellendi ve belirgin iyileşme oldu. Hâlâ mükemmel değil ama kabul edilebilir. Araç genel olarak iyi.',
        rating: 3,
        km: 20000,
        topics: ['Şanzıman', 'Servis'],
        usage: '3-12m',
      },
      {
        title: 'Gençlere uygun',
        content:
          'Tasarım agresif, iç mekan modern, teknoloji dolu. Motor sesi hoş. Arka koltuk ve bagaj sınıfına göre geniş. Fiyat/performans dengesi iyi.',
        rating: 5,
        km: 8000,
        topics: ['Konfor', 'Fiyat/Değer'],
        usage: '0-3m',
      },
      {
        title: 'Lastik aşınması hızlı',
        content:
          "Ön lastikler 30 bin km'de bitti, servis rot balans ayarı yaptı. Yol tutuş iyi ama lastik maliyeti düşündürücü. Motor ve yakıt tarafında memnunum.",
        rating: 4,
        km: 33000,
        topics: ['Servis', 'Motor'],
        usage: '1-3y',
      },
      {
        title: 'Şanzıman yüzünden pişmanım',
        content:
          'DCT şanzımanın trafikteki kararsızlığı ve sarsıntısı her gün sinir bozuyor. Manuel versiyonu almalıymışım. Aracın geri kalanı güzel ama şanzıman deneyimi mahvediyor.',
        rating: 2,
        km: 26000,
        topics: ['Şanzıman'],
        usage: '1-3y',
      },
    ],
  },
  {
    brand: 'Volkswagen',
    model: 'Passat',
    prefer: [
      /^Passat \(B8, facelift 2019\) · 1\.6 TDI/,
      /^Passat \(B8, facelift 2019\) · 2\.0 TDI \(150 bg\) DSG/,
      /^Passat \(B8, facelift 2019\) · 2\.0 TDI/,
      /^Passat \(B8/,
      /Passat/,
    ],
    specs: { fuelType: 'diesel', transmission: 'automatic', bodyType: 'sedan' },
    bias: {
      comfort: 1.3,
      interior: 1.0,
      performance: 0.6,
      value: -1.0,
      reliability: -0.9,
      exterior: 0.5,
    },
    reviews: [
      {
        title: 'Premium hissi',
        content:
          'Yol tutuş, konfor ve kabin kalitesi bir üst segmente göz kırpıyor. DSG şanzıman hızlı ve pürüzsüz. Uzun yolda 5 litre tüketim. Fiyatı yüksek ama karşılığını veriyor.',
        rating: 5,
        km: 48000,
        topics: ['Konfor', 'Şanzıman', 'Yakıt'],
        usage: '1-3y',
      },
      {
        title: 'DSG mekatronik arızası',
        content:
          "90 bin km'de DSG mekatronik ünitesi arızalandı, vitesler kayboldu. Garanti dışı 45 bin lira masraf. B8 Passat DSG için bu sorun maalesef çok yaygın.",
        rating: 1,
        km: 92000,
        topics: ['Şanzıman', 'Servis', 'Fiyat/Değer'],
        usage: '3y+',
      },
      {
        title: 'Servis maliyetleri yüksek',
        content:
          'Her bakımda 10 bin lira üstü fatura. DSG yağ değişimi ayrı masraf. Araç harika ama Volkswagen servis fiyatları bu segmentte bile fazla.',
        rating: 3,
        km: 75000,
        topics: ['Servis', 'Fiyat/Değer'],
        usage: '3y+',
      },
      {
        title: 'DSG titreme',
        content:
          'Düşük hızlarda ve kalkışlarda DSG titremesi başladı. Servis debriyaj paketi değişimi dedi, garantide yapıldı. Yorucu bir süreçti ama şu an sorunsuz.',
        rating: 3,
        km: 64000,
        topics: ['Şanzıman', 'Servis'],
        usage: '1-3y',
      },
      {
        title: 'Aile aracı için ideal',
        content:
          'Devasa bagaj, geniş arka koltuk, sessiz kabin. Çocuklarla uzun yolculuklar çok rahat. Adaptif hız sabitleyici ve şerit asistanı otoyolda rahatlatıyor.',
        rating: 5,
        km: 56000,
        topics: ['Konfor', 'Güvenlik'],
        usage: '1-3y',
      },
      {
        title: 'Motor çok ekonomik',
        content:
          "TDI motor otoyolda 4.6 litre, şehir içinde 6 litre. 1500 km'yi tek depoyla gidiyor. Tork çok iyi, sollamalar güvenli. Dizel sesi kabine çok az geliyor.",
        rating: 5,
        km: 83000,
        topics: ['Yakıt', 'Motor'],
        usage: '3y+',
      },
      {
        title: 'DSG garanti sonrası korkutuyor',
        content:
          "Şu an sorun yok ama DSG şanzımanla ilgili onca hikaye garanti bittikten sonra endişelendiriyor. 60 bin km'de DSG yağını değiştirdim. Konforu mükemmel.",
        rating: 4,
        km: 61000,
        topics: ['Şanzıman', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Klima arka bölge zayıf',
        content:
          'Üç bölgeli klima var ama arka bölge ön kadar etkili değil. Yazın arka koltuktakiler şikayet ediyor. Ön tarafta sorun yok. Diğer her şey çok iyi.',
        rating: 4,
        km: 37000,
        topics: ['Klima', 'Konfor'],
        usage: '1-3y',
      },
      {
        title: 'Egzoz sistemi arızası',
        content:
          'DPF filtresi tıkandı ve motor arıza lambası yandı. Şehir içi kısa kullanımdan kaynaklandığını söylediler. Rejenerasyon için düzenli uzun yol yapmak gerekiyor. Masraf 6 bin lira.',
        rating: 2,
        km: 70000,
        topics: ['Motor', 'Servis'],
        usage: '3y+',
      },
      {
        title: 'Değer kaybı düşük',
        content:
          '4 yıl kullanıp sattım, ciddi bir kayıp olmadı. Passat ikinci elde hâlâ çok talep görüyor. DSG şanzımanı sorunsuz kullandım, bakımları zamanında yaptırdım.',
        rating: 4,
        km: 110000,
        topics: ['Fiyat/Değer', 'Şanzıman'],
        usage: '3y+',
      },
      {
        title: 'Direksiyon kutusu sesi',
        content:
          'Kasislerde direksiyon kutusundan tak tak ses gelmeye başladı. Servis rot başı değiştirdi, geçmedi. İkinci gidişte direksiyon kutusu değişti. Garantide yapıldı.',
        rating: 3,
        km: 52000,
        topics: ['Servis', 'Güvenlik'],
        usage: '1-3y',
      },
      {
        title: 'DSG vites atlama',
        content:
          'Yokuş inişlerinde ve ani frenlerde DSG vites atlıyor, kafa karıştırıcı. Spor moda alınca daha mantıklı davranıyor. Servis yazılım güncelledi, kısmen düzeldi.',
        rating: 3,
        km: 41000,
        topics: ['Şanzıman'],
        usage: '1-3y',
      },
      {
        title: 'Konfor üst seviye',
        content:
          'Ergonomik koltuklar, masaj fonksiyonu, sessiz kabin. İstanbul trafiğinde bile dinlendirici. Yakıt tüketimi şehir içinde 6.5 litre. Çok memnunum.',
        rating: 5,
        km: 30000,
        topics: ['Konfor', 'Yakıt'],
        usage: '3-12m',
      },
      {
        title: 'Şanzıman ve servis kabusu',
        content:
          'DSG arızası nedeniyle 3 kez servise gittim, her seferinde farklı teşhis. Toplam 2 ay araçsız kaldım. Sonunda mekatronik değişti. Servis iletişimi çok kötüydü.',
        rating: 1,
        km: 88000,
        topics: ['Şanzıman', 'Servis'],
        usage: '3y+',
      },
    ],
  },
];

// Deterministik rastgelelik (idempotent dağılım)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function main() {
  const client = createClient();
  await client.connect();

  try {
    await client.query('BEGIN');

    // --- kullanıcılar ---
    const hash = await bcrypt.hash(SEED_PASSWORD, 10);
    const userIds: string[] = [];
    for (let i = 0; i < SEED_USERS.length; i++) {
      const [first, last] = SEED_USERS[i];
      const email = `seed+${i + 1}@nedersin.test`;
      const res = await client.query<{ id: string }>(
        `INSERT INTO users (first_name, last_name, email, password, terms_accepted)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
         RETURNING id`,
        [first, last, email, hash],
      );
      userIds.push(res.rows[0].id);
    }
    console.log(
      `${userIds.length} seed kullanıcı hazır (şifre: ${SEED_PASSWORD})`,
    );

    // --- araçlar + yorumlar ---
    let totalReviews = 0;
    const allReviewIds: { id: string; userId: string }[] = [];

    for (const [ci, car] of CARS.entries()) {
      const { rows } = await client.query<{ id: string; name: string }>(
        `SELECT s.id, s.name FROM car_sub_models s
           JOIN car_models m ON m.id = s.model_id
           JOIN brands b ON b.id = m.brand_id
          WHERE lower(b.name) = lower($1) AND lower(m.name) = lower($2)
          ORDER BY s.year DESC, s.name`,
        [car.brand, car.model],
      );
      let sub: { id: string; name: string } | undefined;
      for (const re of car.prefer) {
        sub = rows.find((r) => re.test(r.name));
        if (sub) break;
      }
      if (!sub) {
        console.warn(
          `  ! ${car.brand} ${car.model} için alt model bulunamadı, atlandı`,
        );
        continue;
      }

      await client.query(
        `UPDATE car_sub_models SET fuel_type = $2, transmission = $3, body_type = $4 WHERE id = $1`,
        [
          sub.id,
          car.specs.fuelType,
          car.specs.transmission,
          car.specs.bodyType,
        ],
      );

      const existing = await client.query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM reviews r JOIN users u ON u.id = r.user_id
          WHERE r.car_sub_model_id = $1 AND u.email LIKE 'seed+%@nedersin.test'`,
        [sub.id],
      );
      if (parseInt(existing.rows[0].c, 10) > 0) {
        // Yorumlar var: sadece kategori puanlarını (araç karakteri) tazele
        const seeded = await client.query<{
          id: string;
          user_id: string;
          title: string;
          rating: number;
        }>(
          `SELECT r.id, r.user_id, r.title, r.rating FROM reviews r JOIN users u ON u.id = r.user_id
            WHERE r.car_sub_model_id = $1 AND u.email LIKE 'seed+%@nedersin.test'`,
          [sub.id],
        );
        for (const row of seeded.rows) {
          const ri = car.reviews.findIndex((x) => x.title === row.title);
          await client.query(
            `UPDATE reviews SET category_ratings = $2::jsonb WHERE id = $1`,
            [
              row.id,
              JSON.stringify(
                categoryRatings(
                  row.rating,
                  (ri < 0 ? 0 : ri) + ci * 31,
                  car.bias,
                ),
              ),
            ],
          );
        }
        console.log(
          `  = ${car.brand} ${car.model} (${sub.name}): ${seeded.rowCount} seed yorumu zaten var, kategori puanları tazelendi`,
        );
        const ids = await client.query<{ id: string; user_id: string }>(
          `SELECT id, user_id FROM reviews WHERE car_sub_model_id = $1`,
          [sub.id],
        );
        allReviewIds.push(
          ...ids.rows.map((r) => ({ id: r.id, userId: r.user_id })),
        );
        continue;
      }

      const rand = rng(1000 + ci);
      const order = [...userIds.keys()].sort(() => rand() - 0.5);
      let n = 0;
      for (const [ri, rv] of car.reviews.entries()) {
        const userId = userIds[order[ri % order.length]];
        const daysAgo = Math.floor(rand() * 400) + 1;
        const topics = rv.topics.join(',');
        const res = await client.query<{ id: string }>(
          `INSERT INTO reviews
             (content, title, rating, kilometer, topics, category_ratings, recommends, usage_duration,
              search_text, user_id, car_sub_model_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11,
                   now() - ($12 || ' days')::interval, now() - ($12 || ' days')::interval)
           RETURNING id`,
          [
            rv.content,
            rv.title,
            rv.rating,
            rv.km,
            topics,
            JSON.stringify(categoryRatings(rv.rating, ri + ci * 31, car.bias)),
            rv.rating >= 4 ? true : rv.rating <= 2 ? false : rand() > 0.5,
            rv.usage,
            buildSearchText({
              title: rv.title,
              content: rv.content,
              topics: rv.topics,
            }),
            userId,
            sub.id,
            String(daysAgo),
          ],
        );
        allReviewIds.push({ id: res.rows[0].id, userId });
        n++;
      }
      totalReviews += n;
      console.log(
        `  + ${car.brand} ${car.model} → ${sub.name} [${sub.id}]: ${n} yorum`,
      );
    }

    // --- beğeniler (kendi yorumuna değil); seed beğenileri varsa tekrar eklenmez ---
    const rand = rng(42);
    let likes = 0;
    const likeCheck = await client.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM review_likes rl JOIN users u ON u.id = rl.user_id
        WHERE u.email LIKE 'seed+%@nedersin.test'`,
    );
    const likesExist = parseInt(likeCheck.rows[0].c, 10) > 0;
    for (const r of likesExist ? [] : allReviewIds) {
      const count = Math.floor(rand() * 9); // 0-8
      const likers = [...userIds]
        .sort(() => rand() - 0.5)
        .filter((u) => u !== r.userId)
        .slice(0, count);
      for (const u of likers) {
        const res = await client.query(
          `INSERT INTO review_likes (user_id, review_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [u, r.id],
        );
        likes += res.rowCount ?? 0;
      }
    }

    await client.query('COMMIT');
    console.log(`Tamamlandı: ${totalReviews} yorum, ${likes} beğeni eklendi.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
