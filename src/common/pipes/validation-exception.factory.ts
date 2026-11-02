import { ValidationError } from 'class-validator';
import { ApiException } from '../exceptions/api.exception';

/** Alan adı → kullanıcıya gösterilecek Türkçe etiket. */
const LABELS: Record<string, string> = {
  email: 'E-posta',
  password: 'Şifre',
  passwordConfirmation: 'Şifre tekrarı',
  currentPassword: 'Mevcut şifre',
  newPassword: 'Yeni şifre',
  newPasswordConfirmation: 'Yeni şifre tekrarı',
  firstName: 'Ad',
  lastName: 'Soyad',
  termsAccepted: 'Kullanım koşulları',
  code: 'Kod',
  idToken: 'Google token',
  identityToken: 'Apple token',
  authorizationCode: 'Apple yetki kodu',
  carSubModelId: 'Araç',
  content: 'Yorum',
  title: 'Başlık',
  rating: 'Puan',
  kilometer: 'Kilometre',
  topics: 'Konular',
  categoryRatings: 'Kategori puanları',
  'categoryRatings.comfort': 'Konfor puanı',
  'categoryRatings.interior': 'İç mekan puanı',
  'categoryRatings.performance': 'Performans puanı',
  'categoryRatings.value': 'Fiyat/değer puanı',
  'categoryRatings.exterior': 'Dış tasarım puanı',
  'categoryRatings.reliability': 'Güvenilirlik puanı',
  recommends: 'Tavsiye',
  usageDuration: 'Kullanım süresi',
  imageIds: 'Fotoğraflar',
  file: 'Dosya',
  limit: 'Limit',
  page: 'Sayfa',
};

/** class-validator varsayılan mesajları hep "<property> must ..." / "<property> should ..." biçimindedir. */
const DEFAULT_ENGLISH = /^\S+ (must|should) /;

/**
 * class-validator'ın varsayılan İngilizce mesajları için Türkçe karşılık.
 * DTO'da özel (Türkçe) `message` verilmişse o aynen kullanılır.
 */
function translateConstraint(key: string, rawMessage: string): string {
  if (!DEFAULT_ENGLISH.test(rawMessage)) return rawMessage;
  switch (key) {
    case 'isDefined':
    case 'isNotEmpty':
      return 'zorunlu';
    case 'isString':
      return 'metin olmalı';
    case 'isInt':
      return 'tam sayı olmalı';
    case 'isNumber':
      return 'sayı olmalı';
    case 'isBoolean':
      return 'true ya da false olmalı';
    case 'isEmail':
      return 'geçerli bir e-posta adresi olmalı';
    case 'isUuid':
      return 'geçerli bir kimlik olmalı';
    case 'isArray':
      return 'liste olmalı';
    case 'isIn':
    case 'isEnum':
      return 'izin verilen değerlerden biri olmalı';
    case 'isObject':
      return 'nesne olmalı';
    case 'whitelistValidation':
      return 'tanınmayan bir alan';
    case 'nestedValidation':
      return 'geçersiz';
    default:
      return 'geçersiz';
  }
}

function flatten(
  errors: ValidationError[],
  parent = '',
  out: Record<string, string> = {},
): Record<string, string> {
  for (const err of errors) {
    const path = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints && Object.keys(err.constraints).length > 0) {
      const [key, rawMessage] = Object.entries(err.constraints)[0];
      out[path] = translateConstraint(key, rawMessage);
    } else if (err.children?.length) {
      flatten(err.children, path, out);
    } else {
      out[path] = 'geçersiz';
    }
  }
  return out;
}

export function validationExceptionFactory(errors: ValidationError[]) {
  const flat = flatten(errors);
  const [firstField, firstMsg] = Object.entries(flat)[0] ?? ['', 'geçersiz'];
  const label = LABELS[firstField] ?? firstField;
  return ApiException.validation(`${label} ${firstMsg}`.trim(), flat);
}
