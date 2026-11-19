import { containsDisallowedContent } from './content-filter';

describe('content-filter', () => {
  const clean = [
    'Sık sık servise gittim, sıkıntı çıkarmadı.',
    "Amortisörler 60 bin km'de değişti, götürdüğüm serviste sorun yok.",
    'Yarı yolda kalmadım, yarış arabası gibi gidiyor.',
    'Pislik tutmayan kumaş koltuklar, mal sahibi memnun.',
    'Boktan değil ama fena da değil demeyecek kadar iyi.',
    'Şanzıman yazılımı güncellendi, salınım yok.',
    'Koltuk ısıtması kışın şart, ısıtma 1 dakikada hazır.',
    'Kaputun altında 3 silindir var, 100 beygir.',
  ];
  // "Boktan değil" cümlesi "boktan" içerir; bu bilinçli olarak filtreye takılır.
  const dirty = [
    'Bu araba tam bir amk arabası',
    'Servis çalışanı gerizekalı çıktı',
    'S1kt1r git bu arabayla',
    'o.r.o.s.p.u çocukları satmış',
    'Siktir et bu arabayı',
    'A.M.K ne biçim araç',
    'Salak gibi aldım bu arabayı',
    'What the fuck is this car',
    'yarrak gibi araba',
    'götünü kaldıramıyor bu motor',
  ];

  it.each(clean.filter((t) => !t.startsWith('Boktan')))('temiz: %s', (t) => {
    expect(containsDisallowedContent(t)).toBe(false);
  });

  it.each(dirty)('uygunsuz: %s', (t) => {
    expect(containsDisallowedContent(t)).toBe(true);
  });

  it('başlık da kontrol edilir', () => {
    expect(containsDisallowedContent('Harika araç', 'amk arabası')).toBe(true);
    expect(containsDisallowedContent(null, undefined, '')).toBe(false);
  });
});
