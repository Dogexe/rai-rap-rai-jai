export const CATEGORIES = {
  income: ["เงินเดือน", "โบนัส/รายได้พิเศษ", "ธุรกิจ/ฟรีแลนซ์", "ดอกเบี้ย/เงินลงทุน", "อื่นๆ (รายรับ)"],
  expense: ["อาหารและเครื่องดื่ม", "การเดินทาง", "ที่อยู่อาศัย/ค่าเช่า", "สาธารณูปโภค (ไฟ/น้ำ/เน็ต)", "ช้อปปิ้ง", "บันเทิง", "สุขภาพ", "การศึกษา", "ผ่อนชำระ/หนี้สิน", "ออมเงิน/ลงทุน", "อื่นๆ (รายจ่าย)"]
};
export const CATEGORY_KEYWORDS = {
  expense: [
    ["อาหารและเครื่องดื่ม", ["ข้าว", "กาแฟ", "อาหาร", "กิน", "ก๋วยเตี๋ยว", "ชานม", "เครื่องดื่ม", "สตาร์บัค", "บุฟเฟ่ต์", "ร้านอาหาร", "ของกิน", "ขนม", "ก๋วยจั๊บ", "ส้มตำ"]],
    ["การเดินทาง", ["แท็กซี่", "taxi", "bts", "mrt", "รถไฟฟ้า", "น้ำมัน", "วินมอไซค์", "grab", "แกร็บ", "ค่ารถ", "ทางด่วน", "ที่จอดรถ", "ตั๋วเครื่องบิน", "รถทัวร์"]],
    ["ที่อยู่อาศัย/ค่าเช่า", ["ค่าเช่า", "ค่าห้อง", "ค่าบ้าน", "หอพัก", "คอนโด"]],
    ["สาธารณูปโภค (ไฟ/น้ำ/เน็ต)", ["ค่าไฟ", "ค่าน้ำ", "ค่าเน็ต", "อินเทอร์เน็ต", "ไวไฟ", "wifi", "ค่ามือถือ", "ค่าโทรศัพท์"]],
    ["ช้อปปิ้ง", ["ช้อปปิ้ง", "ซื้อของ", "เสื้อผ้า", "shopee", "lazada", "ช็อปปี้", "ลาซาด้า", "รองเท้า"]],
    ["บันเทิง", ["หนัง", "เกม", "คอนเสิร์ต", "netflix", "ดูหนัง", "เที่ยว", "สวนสนุก"]],
    ["สุขภาพ", ["หมอ", "ยา", "โรงพยาบาล", "คลินิก", "ฟิตเนส", "ประกันสุขภาพ"]],
    ["การศึกษา", ["เรียน", "หนังสือ", "คอร์ส", "ค่าเทอม", "อบรม"]],
    ["ผ่อนชำระ/หนี้สิน", ["ผ่อน", "หนี้", "บัตรเครดิต", "สินเชื่อ"]],
    ["ออมเงิน/ลงทุน", ["ออมเงิน", "ลงทุน", "หุ้น", "กองทุน"]]
  ],
  income: [
    ["เงินเดือน", ["เงินเดือน", "salary"]],
    ["โบนัส/รายได้พิเศษ", ["โบนัส", "bonus", "รายได้พิเศษ"]],
    ["ธุรกิจ/ฟรีแลนซ์", ["ฟรีแลนซ์", "freelance", "ธุรกิจ", "ขายของ"]],
    ["ดอกเบี้ย/เงินลงทุน", ["ดอกเบี้ย", "ปันผล"]]
  ]
};
export function guessCategory(note, type) {
  if (!note) return null;
  const text = note.toLowerCase();
  for (const [cat, words] of (CATEGORY_KEYWORDS[type] || [])) {
    if (words.some((w) => text.includes(w.toLowerCase()))) return cat;
  }
  return null;
}
export const CATEGORY_ICON = {
  "เงินเดือน": "briefcase", "โบนัส/รายได้พิเศษ": "gift", "ธุรกิจ/ฟรีแลนซ์": "laptop", "ดอกเบี้ย/เงินลงทุน": "trending-up", "อื่นๆ (รายรับ)": "plus-circle",
  "อาหารและเครื่องดื่ม": "utensils", "การเดินทาง": "car", "ที่อยู่อาศัย/ค่าเช่า": "home", "สาธารณูปโภค (ไฟ/น้ำ/เน็ต)": "zap", "ช้อปปิ้ง": "shopping-bag",
  "บันเทิง": "tv", "สุขภาพ": "heart-pulse", "การศึกษา": "book-open", "ผ่อนชำระ/หนี้สิน": "credit-card", "ออมเงิน/ลงทุน": "piggy-bank", "อื่นๆ (รายจ่าย)": "more-horizontal"
};
export function iconFor(cat) { return CATEGORY_ICON[cat] || "circle"; }
export function rowTone(type) { return type === "income" ? { bg: "var(--color-income-tint)", color: "var(--color-income)" } : { bg: "var(--color-accent-tint)", color: "var(--color-accent)" }; }
export const GOAL_ICONS = ["flag", "piggy-bank", "plane", "shield", "gift", "target"];
export const GOAL_TONES = [
  { bg: "var(--color-accent-tint)", color: "var(--color-accent)" },
  { bg: "var(--color-income-tint)", color: "var(--color-income)" },
  { bg: "var(--color-warning-tint)", color: "var(--color-warning-text)" }
];
