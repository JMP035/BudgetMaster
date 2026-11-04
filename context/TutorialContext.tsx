// Re-exportación desde components/TutorialContent
// Los archivos importan desde "context/TutorialContext"
// pero la implementación vive en components/TutorialContent.tsx
export { TutorialProvider, useTutorial, useTutorialRef, useTutorialScroll, useTutorialAction } from '../components/TutorialContent';
export type { SpotlightRect } from '../components/TutorialContent';
