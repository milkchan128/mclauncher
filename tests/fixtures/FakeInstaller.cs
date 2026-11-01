using System;
using System.IO;
using System.Linq;

internal static class FakeInstaller
{
    private static int Main(string[] args)
    {
        int index = Array.FindIndex(args, arg => arg.StartsWith("/D="));
        if (index < 0) return 99;
        string target = string.Join(" ", args.Skip(index)).Substring(3);
        Directory.CreateDirectory(target);
        File.WriteAllLines(Path.Combine(target, "invocation.txt"), args.Take(index));
        if (Environment.GetEnvironmentVariable("ELECTRON_RUN_AS_NODE") != null) return 98;
        if (File.Exists(Path.Combine(target, "fail-install"))) return 42;
        File.WriteAllText(Path.Combine(target, "mlkc-Client.exe"), "test fixture, never executed");
        return 0;
    }
}
