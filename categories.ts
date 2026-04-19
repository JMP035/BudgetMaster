import type { Ionicons } from "@expo/vector-icons";
import { CustomCategory } from "./services/storage";

export interface Category {
    id: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
}

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS DE GASTOS (20)
// ─────────────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES: Category[] = [
    { id: "food", label: "Comida", icon: "fast-food-outline", color: "#E8943A" },
    { id: "groceries", label: "Supermercado", icon: "cart-outline", color: "#F4A261" },
    { id: "transport", label: "Transporte", icon: "car-outline", color: "#4A9EE8" },
    { id: "fuel", label: "Combustible", icon: "speedometer-outline", color: "#48CAE4" },
    { id: "entertainment", label: "Entretenim.", icon: "game-controller-outline", color: "#9B59B6" },
    { id: "streaming", label: "Streaming", icon: "play-circle-outline", color: "#7B2D8B" },
    { id: "shopping", label: "Compras", icon: "bag-outline", color: "#E84393" },
    { id: "clothes", label: "Ropa", icon: "shirt-outline", color: "#D63384" },
    { id: "health", label: "Salud", icon: "medical-outline", color: "#E8453C" },
    { id: "pharmacy", label: "Farmacia", icon: "bandage-outline", color: "#FF6B6B" },
    { id: "education", label: "Educación", icon: "school-outline", color: "#3498DB" },
    { id: "utilities", label: "Servicios", icon: "flash-outline", color: "#F5C842" },
    { id: "internet", label: "Internet/Tel.", icon: "wifi-outline", color: "#20C997" },
    { id: "rent", label: "Renta/Casa", icon: "home-outline", color: "#2ECC71" },
    { id: "travel", label: "Viajes", icon: "airplane-outline", color: "#0EA5E9" },
    { id: "restaurant", label: "Restaurante", icon: "restaurant-outline", color: "#FB923C" },
    { id: "atm", label: "Retiro ATM", icon: "cash-outline", color: "#84CC16" },
    { id: "transfer", label: "Transferencia", icon: "swap-horizontal-outline", color: "#8B5CF6" },
    { id: "subscriptions", label: "Suscripciones", icon: "repeat-outline", color: "#06B6D4" },
    { id: "other", label: "Otro", icon: "ellipsis-horizontal-circle-outline", color: "#95A5A6" },
];

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS DE INGRESOS (10)
// ─────────────────────────────────────────────────────────────
export const INCOME_CATEGORIES: Category[] = [
    { id: "salary", label: "Salario", icon: "briefcase-outline", color: "#D4882A" },
    { id: "military", label: "Pago Militar", icon: "shield-outline", color: "#6B8E23" },
    { id: "freelance", label: "Freelance", icon: "laptop-outline", color: "#9B59B6" },
    { id: "investment", label: "Inversiones", icon: "trending-up-outline", color: "#2ECC71" },
    { id: "rental", label: "Alquiler", icon: "key-outline", color: "#F39C12" },
    { id: "business", label: "Negocio", icon: "storefront-outline", color: "#E74C3C" },
    { id: "transfer_in", label: "Transferencia", icon: "swap-horizontal-outline", color: "#8B5CF6" },
    { id: "bonus", label: "Bono/Extra", icon: "star-outline", color: "#F1C40F" },
    { id: "gift", label: "Regalo", icon: "gift-outline", color: "#E8453C" },
    { id: "other", label: "Otro", icon: "cash-outline", color: "#95A5A6" },
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Convierte una CustomCategory al formato Category para usar en UI */
export function customToCategory(c: CustomCategory): Category {
    return {
        id: c.id,
        label: c.label,
        icon: c.icon as keyof typeof Ionicons.glyphMap,
        color: c.color,
    };
}

/** Busca una categoría en predefinidas + custom */
export const getCat = (id: string, customCategories: CustomCategory[] = []): Category => {
    // Buscar en predefinidas primero
    const predefined = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find(c => c.id === id);
    if (predefined) return predefined;

    // Buscar en custom
    const custom = customCategories.find(c => c.id === id);
    if (custom) return customToCategory(custom);

    // Fallback
    return { id, label: id, icon: "ellipsis-horizontal-circle-outline", color: "#95A5A6" };
};

/** Retorna todas las categorías de gastos incluyendo custom */
export function getAllExpenseCategories(customCategories: CustomCategory[] = []): Category[] {
    const customExpense = customCategories
        .filter(c => c.type === 'expense' || c.type === 'both')
        .map(customToCategory);
    return [...EXPENSE_CATEGORIES, ...customExpense];
}

/** Retorna todas las categorías de ingresos incluyendo custom */
export function getAllIncomeCategories(customCategories: CustomCategory[] = []): Category[] {
    const customIncome = customCategories
        .filter(c => c.type === 'income' || c.type === 'both')
        .map(customToCategory);
    return [...INCOME_CATEGORIES, ...customIncome];
}

/** Colores disponibles para categorías custom */
export const CATEGORY_COLORS = [
    "#E8943A", "#F4A261", "#4A9EE8", "#48CAE4", "#9B59B6",
    "#E84393", "#E8453C", "#3498DB", "#F5C842", "#2ECC71",
    "#20C997", "#0EA5E9", "#FB923C", "#84CC16", "#8B5CF6",
    "#06B6D4", "#D4882A", "#6B8E23", "#F39C12", "#95A5A6",
];

/** Iconos disponibles para categorías custom */
export const CATEGORY_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
    "fast-food-outline", "cart-outline", "car-outline", "home-outline",
    "medical-outline", "school-outline", "flash-outline", "airplane-outline",
    "game-controller-outline", "shirt-outline", "gift-outline", "star-outline",
    "briefcase-outline", "laptop-outline", "trending-up-outline", "cash-outline",
    "phone-portrait-outline", "fitness-outline", "paw-outline", "restaurant-outline",
    "beer-outline", "cafe-outline", "bicycle-outline", "boat-outline",
    "book-outline", "build-outline", "camera-outline", "color-palette-outline",
    "diamond-outline", "earth-outline", "flower-outline", "football-outline",
    "hardware-chip-outline", "headset-outline", "heart-outline", "key-outline",
    "leaf-outline", "map-outline", "musical-notes-outline", "shield-outline",
];