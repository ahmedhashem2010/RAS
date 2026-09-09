// Centralized Arabic UI strings. The app is Arabic-first with RTL.
// English support can be added later by extending this dictionary.

export const appName = "RAS";
export const appSubtitle = "Resala Administration System";
export const appSubtitleAr = "نظام إدارة رسالة";

export const nav = {
  dashboard: "الرئيسية",
  volunteers: "المتطوعون",
  convoys: "القوافل",
  tasks: "المهام",
  awards: "الجوائز",
  warnings: "الإنذارات",
  analytics: "التحليلات",
  notifications: "الإشعارات",
  leaderboard: "لوحة الترتيب",
  performance: "الأداء",
  profile: "الملف الشخصي",
  myTasks: "مهامي",
  home: "الرئيسية",
  users: "المستخدمون والإدارة",
  audit: "سجل العمليات",
  settings: "إعدادات النظام",
  attendance: "الحضور",
  evaluate: "التقييم",
  committees: "اللجان",
  leaders: "القادة",
};

export const committeeRoleLabels: Record<string, string> = {
  leader: "قائد",
  deputy: "نائب القائد",
};

export const volunteerStatusLabels: Record<string, string> = {
  active: "نشط",
  inactive: "منسحب",
};

export const departmentRoleExplanation = {
  leader: "قائد اللجنة",
  deputy: "نائب قائد اللجنة",
};

export const volunteersCommon = {
  addVolunteer: "إضافة متطوع",
  editVolunteer: "تعديل بيانات المتطوع",
  committees: "اللجان",
  committee: "اللجنة",
  leader: "القائد",
  deputy: "نائب القائد",
  linkAccount: "ربط الحساب",
  unlinkAccount: "فك ربط الحساب",
  noCommittees: "بدون لجنة",
  activeVolunteers: "متطوع نشط",
  inactiveVolunteers: "متطوع منسحب",
  totalCommittees: "إجمالي اللجان",
  leadersCount: "عدد القادة",
  addCommittee: "إضافة لجنة",
  noResults: "لا توجد نتائج مطابقة.",
  assignCommittees: "تعيين اللجان",
  manageLeadership: "إدارة القيادة",
};

export const convoyTypeLabels: Record<string, string> = {
  normal: "قافلة عادية",
  mini_camp: "معسكر مصغر",
  full_camp: "معسكر كامل",
};

export const convoyStatusLabels: Record<string, string> = {
  upcoming: "قادمة",
  active: "نشطة",
  completed: "منتهية",
  cancelled: "ملغاة",
};

export const attendanceLabels: Record<string, string> = {
  present: "حاضر",
  excused: "معذور",
  absent: "غائب",
};

export const taskStatusLabels: Record<string, string> = {
  pending: "قيد الانتظار",
  in_progress: "قيد التنفيذ",
  submitted: "تم التسليم",
  approved: "مقبولة",
  rejected: "مرفوضة",
};

export const awardTypeLabels: Record<string, string> = {
  volunteer_of_day: "المتطوع المثالي",
  best_leader: "أفضل قائد",
};

export const roleLabels: Record<string, string> = {
  volunteer: "متطوع",
  general_admin: "مدير عام",
  super_admin: "مدير النظام",
};

export const accountStatusLabels: Record<string, string> = {
  active: "نشط",
  banned: "محظور",
};

export const common = {
  save: "حفظ",
  cancel: "إلغاء",
  create: "إنشاء",
  edit: "تعديل",
  delete: "حذف",
  search: "بحث",
  loading: "جاري التحميل...",
  noData: "لا توجد بيانات بعد",
  confirm: "تأكيد",
  close: "إغلاق",
  actions: "إجراءات",
  back: "رجوع",
  add: "إضافة",
  yes: "نعم",
  no: "لا",
  required: "مطلوب",
  view: "عرض",
  approve: "قبول",
  reject: "رفض",
  submit: "إرسال",
  rank: "الترتيب",
  name: "الاسم",
  score: "النقاط",
  date: "التاريخ",
  status: "الحالة",
  reason: "السبب",
  all: "الكل",
  details: "التفاصيل",
  volunteers: "المتطوعون",
  members: "الأعضاء",
  average: "المتوسط",
  points: "نقطة",
};

export const errors = {
  generic: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  notAuthorized: "ليس لديك صلاحية للقيام بهذا الإجراء.",
  notFound: "غير موجود.",
  requiredFields: "يرجى إكمال الحقول المطلوبة.",
  invalidEmail: "يرجى إدخال بريد إلكتروني صحيح.",
  invalidPhone: "يرجى إدخال رقم هاتف صحيح.",
  invalidDate: "يرجى إدخال تاريخ صحيح.",
  ratingRange: "يجب أن يكون التقييم من 1 إلى 5.",
  warningReason: "سبب الإنذار مطلوب ولا يمكن أن يكون فارغاً.",
  deadlineInvalid: "يرجى إدخال موعد نهائي صحيح.",
  convoyLocked: "لا يمكن التعديل بعد اكتمال القافلة.",
  authFailed: "بيانات الدخول غير صحيحة.",
};
