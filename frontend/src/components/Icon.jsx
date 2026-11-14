// أيقونات البرنامج: أيقونة خطية (Tabler) جوه مربع ملون — كل قسم بلونه
// الصفحات لسه بتبعت الإيموجي زي ما هي، والمكوّن هنا بيحوّلها للأيقونة المناسبة
import {
  IconHome, IconCalendarEvent, IconPackage, IconBuildingStore, IconShoppingCart, IconSpeakerphone, IconCoins,
  IconBuildingBank, IconTag, IconLink, IconClipboardList, IconAlertTriangle, IconRefresh, IconPackageImport,
  IconBuildingFactory2, IconCreditCard, IconCashBanknoteOff, IconChartLine, IconChartBar, IconUser, IconFolders,
  IconCalculator, IconLock, IconPalette, IconSparkles, IconActivity, IconCircleCheck, IconStar, IconHourglass,
  IconArrowBackUp, IconReceipt, IconHandStop, IconBan, IconTruckDelivery, IconTrash, IconMailForward, IconUpload,
  IconPencil, IconCalendar, IconFileText, IconDeviceFloppy, IconCash, IconZzz, IconTrendingUp, IconPlus, IconX,
  IconSettings, IconScale, IconCirclePlus, IconDiamond,
} from '@tabler/icons-react';

const C = { indigo: '#818cf8', amber: '#fbbf24', orange: '#fb923c', pink: '#f472b6', green: '#34d399', teal: '#2dd4bf',
  violet: '#a78bfa', sky: '#38bdf8', slate: '#94a3b8', red: '#f87171', rose: '#fb7185', lime: '#a3e635', cyan: '#22d3ee', stone: '#d6d3d1' };

export const ICON_MAP = {
  '🏠': [IconHome, C.indigo], '🗓️': [IconCalendarEvent, C.violet], '📅': [IconCalendar, C.violet],
  '📦': [IconPackage, C.amber], '🚚': [IconTruckDelivery, C.amber], '🏪': [IconBuildingStore, C.teal],
  '🛒': [IconShoppingCart, C.orange], '📣': [IconSpeakerphone, C.pink], '💰': [IconCoins, C.green], '🏦': [IconBuildingBank, C.teal],
  '🏷️': [IconTag, C.violet], '🔗': [IconLink, C.sky], '📋': [IconClipboardList, C.slate], '⚠️': [IconAlertTriangle, C.red],
  '🔄': [IconRefresh, C.cyan], '📥': [IconPackageImport, C.green], '🏭': [IconBuildingFactory2, C.stone],
  '💳': [IconCreditCard, C.sky], '💸': [IconCashBanknoteOff, C.rose], '💵': [IconCash, C.green],
  '📈': [IconChartLine, C.green], '📊': [IconChartBar, C.indigo], '⬆️': [IconTrendingUp, C.green],
  '👤': [IconUser, C.sky], '🗂️': [IconFolders, C.amber], '🧮': [IconCalculator, C.lime], '🔐': [IconLock, C.rose],
  '🎨': [IconPalette, C.pink], '✨': [IconSparkles, C.violet], '🟢': [IconActivity, C.green], '⚙️': [IconSettings, C.slate],
  '✅': [IconCircleCheck, C.green], '⭐': [IconStar, C.amber], '⏳': [IconHourglass, C.amber], '↩️': [IconArrowBackUp, C.orange],
  '🧾': [IconReceipt, C.slate], '🛑': [IconHandStop, C.red], '🚫': [IconBan, C.red], '🗑️': [IconTrash, C.red],
  '📨': [IconMailForward, C.sky], '📤': [IconUpload, C.sky], '📝': [IconPencil, C.amber], '📄': [IconFileText, C.slate],
  '💾': [IconDeviceFloppy, C.indigo], '💤': [IconZzz, C.slate], '➕': [IconPlus, C.indigo], '🆕': [IconCirclePlus, C.indigo],
  '❌': [IconX, C.red], '⚖️': [IconScale, C.cyan], '🔷': [IconDiamond, C.sky],
};

// مربع ملون فيه الأيقونة. size = ضلع المربع
export function Tile({ icon, size = 32, color }) {
  const m = ICON_MAP[icon] || ICON_MAP[String(icon || '').replace('️', '') + '️'] || ICON_MAP[String(icon || '').replace('️', '')];
  if (!m) return <span style={{ fontSize: size * 0.6, lineHeight: 1, width: size, textAlign: 'center', flexShrink: 0 }}>{icon}</span>;
  const [I, c0] = m, c = color || c0;
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.28, background: c + '22', color: c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <I size={Math.round(size * 0.56)} stroke={1.8} />
    </span>
  );
}
