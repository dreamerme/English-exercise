declare module "diff-match-patch" {
  export const DIFF_DELETE: -1;
  export const DIFF_INSERT: 1;
  export const DIFF_EQUAL: 0;

  export type Diff = [number, string];

  export class diff_match_patch {
    constructor();
    diff_main(
      text1: string,
      text2: string,
      opt_checklines?: boolean,
      opt_deadline?: number
    ): Diff[];
    diff_cleanupSemantic(diffs: Diff[]): void;
    diff_cleanupEfficiency(diffs: Diff[]): void;
    diff_levenshtein(diffs: Diff[]): number;
    diff_prettyHtml(diffs: Diff[]): string;
    match_main(text: string, pattern: string, loc: number): number;
    patch_make(
      text1: string,
      text2: string | Diff[],
      opt_patches?: any[] | string | null
    ): any[];
    patch_apply(patches: any[], text: string): [string, boolean[]];
  }
}
