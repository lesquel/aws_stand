/* Allow importing CSS files as side effects */
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
