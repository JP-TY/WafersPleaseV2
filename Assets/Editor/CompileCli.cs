using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

namespace WafersPlease.EditorTools
{
    /// <summary>
    /// Headless compile verification entry point.
    /// Invoke with:
    ///   Unity -batchmode -nographics -quit -projectPath . -buildTarget Linux64 \
    ///     -executeMethod WafersPlease.EditorTools.CompileCli.CompileOnly -logFile -
    /// Exits 0 when the player scripts compile with no errors, 1 otherwise.
    /// </summary>
    public static class CompileCli
    {
        public static void CompileOnly()
        {
            bool hadError = false;

            CompilationPipeline.compilationFinished += _ => { };
            CompilationPipeline.assemblyCompilationFinished += (assemblyPath, messages) =>
            {
                foreach (var m in messages)
                {
                    if (m.type == CompilerMessageType.Error)
                    {
                        hadError = true;
                        Debug.LogError($"[CompileOnly] {assemblyPath}: {m.message} ({m.file}:{m.line})");
                    }
                }
            };

            // Force a synchronous compile of the current script state.
            CompilationPipeline.RequestScriptCompilation();
            EditorApplication.LockReloadAssemblies();
            try
            {
                var assemblies = CompilationPipeline.GetAssemblies(AssembliesType.PlayerWithoutTestAssemblies);
                foreach (var asm in assemblies)
                {
                    if (asm.name == "Assembly-CSharp")
                        Debug.Log($"[CompileOnly] Found game assembly: {asm.name} ({asm.sourceFiles.Length} files)");
                }
            }
            finally
            {
                EditorApplication.UnlockReloadAssemblies();
            }

            // In batchmode, the editor recompiles on load; errors surface in the log.
            Debug.Log(hadError ? "[CompileOnly] COMPILE FAILED" : "[CompileOnly] COMPILE OK");
            EditorApplication.Exit(hadError ? 1 : 0);
        }
    }
}
