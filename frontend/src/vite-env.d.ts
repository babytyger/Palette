/// <reference types="vite/client" />

declare module "@lib/compiler" {
  export const PARAM_TYPES: string[];
  export const COMPONENT_SCOPES: string[];
  export const COMPONENT_CATEGORIES: string[];
  export const validateTemplate: (tpl: unknown) => string[];
  export const validateComponent: (c: unknown) => string[];
  export const defaultParamValue: (p: any) => any;
  export const checkComponents: (template: any, selections?: any[], library?: Record<string, any>) => {
    accepted: any[];
    problems: Array<{ id: string; reason: string }>;
  };
  export const compileComponent: (component: any, values?: Record<string, any>) => {
    id: string;
    name: string;
    scope: string;
    text: string;
    overrideNote: string;
    rules: string[];
    parts: any[];
  };
  export const compilePrompt: (template: any, values?: Record<string, any>, options?: any) => any;
}
