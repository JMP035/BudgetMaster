import type { Ionicons } from "@expo/vector-icons";

export interface Category {
    id: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
    { id: "food", label: "Comida", icon: "fast-food-outline", color: "#E8943A" },
    { id: "transport", label: "Transporte", icon: "car-outline", color: "#4A9EE8" },
    { id: "entertainment", label: "Entretenim.", icon: "game-controller-outline", color: "#9B59B6" },
    { id: "shopping", label: "Compras", icon: "bag-outline", color: "#E84393" },
    { id: "health", label: "Salud", icon: "medical-outline", color: "#E8453C" },
    { id: "education", label: "Educación", icon: "school-outline", color: "#3498DB" },
    { id: "utilities", label: "Servicios", icon: "flash-outline", color: "#F5C842" },
    { id: "rent", label: "Renta", icon: "home-outline", color: "#2ECC71" },
    { id: "other", label: "Otro", icon: "ellipsis-horizontal-circle-outline", color: "#95A5A6" },
];

export const INCOME_CATEGORIES: Category[] = [
    { id: "salary", label: "Salario", icon: "briefcase-outline", color: "#D4882A" },
    { id: "freelance", label: "Freelance", icon: "laptop-outline", color: "#9B59B6" },
    { id: "investment", label: "Inversiones", icon: "trending-up-outline", color: "#2ECC71" },
    { id: "gift", label: "Regalo", icon: "gift-outline", color: "#E8453C" },
    { id: "other", label: "Otro", icon: "cash-outline", color: "#95A5A6" },
];

export const getCat = (id: string): Category =>
    [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find(c => c.id === id) ??
    { id, label: id, icon: "ellipsis-horizontal-circle-outline", color: "#95A5A6" };
