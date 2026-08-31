import {
  IconBan,
  IconBolt,
  IconCoins,
  IconCreditCard,
  IconPlane,
  IconReceipt2,
  IconShoppingBag,
  IconShoppingCart,
  IconToolsKitchen2,
  IconWallet,
  type Icon,
} from "@tabler/icons-react";

const CATEGORY_ICONS: Record<string, Icon> = {
  "Food & Dining": IconToolsKitchen2,
  "Groceries": IconShoppingCart,
  "Travel": IconPlane,
  "Shopping": IconShoppingBag,
  "Utilities": IconBolt,
  "Interest Paid": IconReceipt2,
  "Interest Received": IconCoins,
  "Balance Write-off": IconBan,
  "Others": IconWallet,
};

const TYPE_ICONS: Record<string, Icon> = {
  revenue: IconCoins,
  interest_income: IconCoins,
  card_payment: IconCreditCard,
  loan_repayment: IconReceipt2,
  transfer: IconWallet,
};

export function categoryIcon(categoryName: string | null, type?: string): Icon {
  if (categoryName && CATEGORY_ICONS[categoryName]) return CATEGORY_ICONS[categoryName];
  if (type && TYPE_ICONS[type]) return TYPE_ICONS[type];
  return IconWallet;
}
