using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

internal sealed class InstallOptions
{
    internal bool Silent;
    internal bool Updated;
    internal bool ForceRun;
    internal string Scope;
    internal string Directory;

    internal static InstallOptions Parse(string[] args)
    {
        var result = new InstallOptions();
        for (int i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase)) result.Silent = true;
            else if (arg == "--updated") { result.Updated = true; result.Silent = true; }
            else if (arg == "--force-run") result.ForceRun = true;
            else if (arg.Equals("/allusers", StringComparison.OrdinalIgnoreCase)) result.Scope = "all";
            else if (arg.Equals("/currentuser", StringComparison.OrdinalIgnoreCase)) result.Scope = "user";
            else if (arg.StartsWith("/D=", StringComparison.OrdinalIgnoreCase))
            {
                result.Directory = string.Join(" ", args.Skip(i)).Substring(3);
                break;
            }
            else throw new ArgumentException("지원하지 않는 설치 옵션입니다.");
        }
        return result;
    }
}

internal enum SetupPage { Welcome, License, Scope, Location, Installing, Finish }

internal sealed class SetupFlow
{
    internal SetupPage Page = SetupPage.Welcome;
    internal bool AcceptedLicense;
    internal bool Next()
    {
        if (Page == SetupPage.Welcome) Page = SetupPage.License;
        else if (Page == SetupPage.License && AcceptedLicense) Page = SetupPage.Scope;
        else if (Page == SetupPage.Scope) Page = SetupPage.Location;
        else return false;
        return true;
    }
    internal void Back()
    {
        if (Page == SetupPage.License) Page = SetupPage.Welcome;
        else if (Page == SetupPage.Scope) Page = SetupPage.License;
        else if (Page == SetupPage.Location) Page = SetupPage.Scope;
    }
    internal void Start()
    {
        if (Page != SetupPage.Location || !AcceptedLicense) throw new InvalidOperationException("사용권 계약 동의가 필요합니다.");
        Page = SetupPage.Installing;
    }
}

internal static class Installer
{
    internal static Stream Resource(string name)
    {
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
        if (stream == null) throw new InvalidDataException("설치 리소스를 읽을 수 없습니다.");
        return stream;
    }

    internal static string ValidateDirectory(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("설치 위치를 입력해 주세요.");
        value = Environment.ExpandEnvironmentVariables(value.Trim());
        if (!Path.IsPathRooted(value) || value.IndexOfAny(new[] { '\r', '\n', '\0', '"' }) >= 0)
            throw new ArgumentException("설치할 폴더의 전체 경로를 입력해 주세요.");
        var full = Path.GetFullPath(value).TrimEnd('\\', '/');
        if (full.StartsWith(@"\\") || full.Equals(Path.GetPathRoot(full).TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("로컬 디스크 안의 별도 폴더를 지정해 주세요.");
        for (var dir = new DirectoryInfo(full); dir != null; dir = dir.Parent)
            if (dir.Exists && (dir.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new ArgumentException("연결된 폴더 대신 실제 로컬 폴더를 선택해 주세요.");
        if (File.Exists(full)) throw new ArgumentException("파일 대신 폴더 경로를 입력해 주세요.");
        if (System.IO.Directory.Exists(full) && System.IO.Directory.EnumerateFileSystemEntries(full).Any()
            && !(File.Exists(Path.Combine(full, "mlkc-Client.exe")) && File.Exists(Path.Combine(full, "resources", "app.asar"))))
            throw new ArgumentException("다른 파일을 보호하기 위해 비어 있는 폴더에 설치해 주세요.");
        return full;
    }

    internal static string DefaultDirectory(bool allUsers)
    {
        try
        {
            using (var uninstall = (allUsers ? Registry.LocalMachine : Registry.CurrentUser).OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall"))
            {
                if (uninstall != null)
                    foreach (var name in uninstall.GetSubKeyNames())
                        using (var key = uninstall.OpenSubKey(name))
                        {
                            if (key == null || !string.Equals(key.GetValue("DisplayName") as string, "mlkc Client", StringComparison.OrdinalIgnoreCase)) continue;
                            var location = key.GetValue("InstallLocation") as string;
                            if (!string.IsNullOrWhiteSpace(location) && File.Exists(Path.Combine(location, "mlkc-Client.exe")))
                                return location;
                        }
            }
        }
        catch (System.Security.SecurityException) { }
        catch (UnauthorizedAccessException) { }
        return allUsers ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "mlkc Client")
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "mlkc Client");
    }

    internal static int Run(InstallOptions options, Action<string> progress)
    {
        var target = options.Directory == null ? null : ValidateDirectory(options.Directory);
        var tempRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
        var workspace = Path.Combine(tempRoot, "mlkc-setup-" + Guid.NewGuid().ToString("N"));
        System.IO.Directory.CreateDirectory(workspace);
        try
        {
            progress("설치 파일을 준비하고 있습니다…");
            var payload = Path.Combine(workspace, "client-install.exe");
            using (var input = Resource("backend.exe"))
            using (var output = File.Create(payload)) input.CopyTo(output);
            using (var hash = SHA256.Create())
            using (var input = File.OpenRead(payload))
                if (!BitConverter.ToString(hash.ComputeHash(input)).Replace("-", "").Equals(SetupBuild.PayloadSha256, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("설치 파일이 손상되었습니다. 다시 다운로드해 주세요.");
            progress("클라이언트를 설치하고 있습니다…");
            var arguments = "/S" + (options.Updated ? " --updated" : "") + (options.ForceRun ? " --force-run" : "");
            if (options.Scope != null) arguments += options.Scope == "all" ? " /allusers" : " /currentuser";
            // NSIS의 /D 인수는 공백을 포함한 경로를 따옴표 없이 마지막에 받는다.
            if (target != null) arguments += " /D=" + target;
            var info = new ProcessStartInfo(payload, arguments) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = workspace };
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            using (var process = Process.Start(info))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        finally
        {
            if (string.Equals(Path.GetDirectoryName(workspace), tempRoot, StringComparison.OrdinalIgnoreCase))
                try { System.IO.Directory.Delete(workspace, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    internal static void SelfTest()
    {
        var options = InstallOptions.Parse(new[] { "/S", "--updated", "--force-run", "/D=C:\\Games\\mlkc Client" });
        if (!options.Silent || !options.Updated || !options.ForceRun || options.Directory != @"C:\Games\mlkc Client") throw new Exception("설치 옵션 검증 실패");
        if (InstallOptions.Parse(new[] { "/S", "/allusers" }).Scope != "all") throw new Exception("설치 대상 검증 실패");
        var flow = new SetupFlow();
        flow.Next();
        if (flow.Page != SetupPage.License || flow.Next()) throw new Exception("EULA 동의 우회 방지 검증 실패");
        flow.AcceptedLicense = true; flow.Next();
        if (flow.Page != SetupPage.Scope) throw new Exception("설치 대상 단계 검증 실패");
        flow.Next(); flow.Back();
        if (flow.Page != SetupPage.Scope) throw new Exception("이전 단계 검증 실패");
        flow.Next(); flow.Start();
        if (flow.Page != SetupPage.Installing) throw new Exception("설치 단계 검증 실패");
        bool rejected = false;
        try { ValidateDirectory(Path.GetPathRoot(Environment.SystemDirectory)); } catch (ArgumentException) { rejected = true; }
        if (!rejected) throw new Exception("루트 경로 검증 실패");
        using (var input = Resource("Window.xaml"))
        {
            var window = (Window)XamlReader.Load(input);
            if (window.WindowStyle != WindowStyle.None || window.FindName("InstallButton") == null || window.FindName("InstallPath") == null
                || !(((Grid)window.FindName("PageContent")).RenderTransform is TranslateTransform))
                throw new Exception("설치 화면 검증 실패");
            window.Close();
        }
        using (var hash = SHA256.Create())
        using (var input = Resource("backend.exe"))
            if (!BitConverter.ToString(hash.ComputeHash(input)).Replace("-", "").Equals(SetupBuild.PayloadSha256, StringComparison.OrdinalIgnoreCase))
                throw new Exception("내장 설치 파일 검증 실패");
    }
}

internal sealed class SetupWindow
{
    private readonly Window window;
    private readonly Button install;
    private readonly TextBox location;
    private readonly TextBlock heading;
    private readonly TextBlock description;
    private readonly TextBlock status;
    private readonly ProgressBar progress;
    private readonly Button close;
    private readonly SetupFlow flow = new SetupFlow();
    private readonly Button back;
    private readonly CheckBox acceptance;
    private readonly RadioButton allUsers;
    private readonly Grid pageContent;
    private bool transitioning;

    internal SetupWindow()
    {
        using (var input = Installer.Resource("Window.xaml")) window = (Window)XamlReader.Load(input);
        var scale = Math.Min(1, Math.Min((SystemParameters.WorkArea.Width - 24) / 860, (SystemParameters.WorkArea.Height - 24) / 552));
        window.Width = 860 * scale; window.Height = 552 * scale;
        install = (Button)window.FindName("InstallButton");
        location = (TextBox)window.FindName("InstallPath");
        heading = (TextBlock)window.FindName("Heading");
        description = (TextBlock)window.FindName("Description");
        status = (TextBlock)window.FindName("StatusText");
        progress = (ProgressBar)window.FindName("Progress");
        close = (Button)window.FindName("CloseButton");
        back = (Button)window.FindName("BackButton");
        acceptance = (CheckBox)window.FindName("AcceptLicense");
        allUsers = (RadioButton)window.FindName("AllUsers");
        pageContent = (Grid)window.FindName("PageContent");
        ((ImageBrush)window.FindName("SceneBrush")).ImageSource = Image("scene.png");
        ((Image)window.FindName("BrandLogo")).Source = Image("logo.png");
        ((Image)window.FindName("BandLogo")).Source = Image("logo.png");
        ((TextBlock)window.FindName("VersionText")).Text = "버전 " + SetupBuild.Version;
        location.Text = Installer.DefaultDirectory(false);
        location.ToolTip = location.Text;
        location.TextChanged += delegate { location.ToolTip = location.Text; };
        using (var text = new StreamReader(Installer.Resource("LICENSE.txt"))) ((TextBlock)window.FindName("LicenseText")).Text = text.ReadToEnd();
        ((Hyperlink)window.FindName("MinecraftEula")).Click += delegate { Process.Start(new ProcessStartInfo("https://www.minecraft.net/ko-kr/eula") { UseShellExecute = true }); };
        acceptance.Checked += ConsentChanged;
        acceptance.Unchecked += ConsentChanged;
        allUsers.Checked += delegate { location.Text = Installer.DefaultDirectory(true); };
        ((RadioButton)window.FindName("CurrentUser")).Checked += delegate { location.Text = Installer.DefaultDirectory(false); };
        close.Click += delegate { window.Close(); };
        ((Button)window.FindName("MinimizeButton")).Click += delegate { window.WindowState = WindowState.Minimized; };
        ((Button)window.FindName("FinishCloseButton")).Click += delegate { window.Close(); };
        ((Grid)window.FindName("TitleBar")).MouseLeftButtonDown += delegate { window.DragMove(); };
        window.Closing += delegate(object sender, System.ComponentModel.CancelEventArgs e) { e.Cancel = flow.Page == SetupPage.Installing; };
        back.Click += delegate { if (!transitioning) { flow.Back(); RenderPage(true, true); } };
        install.Click += InstallClicked;
        RenderPage();
        if (SystemParameters.ClientAreaAnimation) window.Loaded += delegate { PlayIntro(); };
    }

    // 런처 메인 화면과 같은 진입 효과: 배경이 줌 아웃되고 하단 띠가 올라온다.
    private void PlayIntro()
    {
        var easing = new CubicEase { EasingMode = EasingMode.EaseOut };
        var zoom = new ScaleTransform(1, 1, 0.5, 0.5);
        ((ImageBrush)window.FindName("SceneBrush")).RelativeTransform = zoom;
        var zoomIn = new DoubleAnimation(1.08, 1, TimeSpan.FromMilliseconds(1200)) { EasingFunction = easing };
        zoom.BeginAnimation(ScaleTransform.ScaleXProperty, zoomIn);
        zoom.BeginAnimation(ScaleTransform.ScaleYProperty, zoomIn);
        var band = (Border)window.FindName("BrandBand");
        var rise = TimeSpan.FromMilliseconds(700);
        band.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, rise) { EasingFunction = easing });
        ((TranslateTransform)band.RenderTransform).BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(80, 0, rise) { EasingFunction = easing });
        RenderPage(true);
    }

    private void ConsentChanged(object sender, RoutedEventArgs e)
    {
        flow.AcceptedLicense = acceptance.IsChecked == true;
        if (flow.Page == SetupPage.License) install.IsEnabled = flow.AcceptedLicense;
    }

    private void RenderPage(bool animate = false, bool backwards = false)
    {
        foreach (var name in new[] { "LicensePanel", "ScopePanel", "LocationPanel", "FinishCloseButton" })
            ((FrameworkElement)window.FindName(name)).Visibility = Visibility.Collapsed;
        bool busy = flow.Page == SetupPage.Installing;
        close.IsEnabled = !busy;
        back.IsEnabled = !busy;
        back.Visibility = flow.Page == SetupPage.License || flow.Page == SetupPage.Scope || flow.Page == SetupPage.Location ? Visibility.Visible : Visibility.Collapsed;
        install.IsEnabled = !busy && (flow.Page != SetupPage.License || flow.AcceptedLicense);
        location.IsEnabled = !busy;
        status.Text = "";
        status.Foreground = (Brush)window.Resources["Muted"];
        progress.Visibility = busy ? Visibility.Visible : Visibility.Collapsed;
        progress.IsIndeterminate = busy && SystemParameters.ClientAreaAnimation;
        install.Content = "다음";
        switch (flow.Page)
        {
            case SetupPage.Welcome:
                heading.Text = "설치를 시작할게요";
                description.Text = "밀튜디오 클라이언트에 오신 것을 환영합니다.\n설치 단계를 차례대로 안내해 드릴게요.";
                break;
            case SetupPage.License:
                heading.Text = "사용권 계약";
                description.Text = "계약 내용을 확인하고 동의해 주세요.";
                ((FrameworkElement)window.FindName("LicensePanel")).Visibility = Visibility.Visible;
                break;
            case SetupPage.Scope:
                heading.Text = "설치 대상";
                description.Text = "클라이언트를 사용할 계정을 선택해 주세요.";
                ((FrameworkElement)window.FindName("ScopePanel")).Visibility = Visibility.Visible;
                break;
            case SetupPage.Location:
                heading.Text = "설치 위치";
                description.Text = "선택한 폴더에 클라이언트를 설치합니다.";
                ((FrameworkElement)window.FindName("LocationPanel")).Visibility = Visibility.Visible;
                install.Content = "설치 시작";
                break;
            case SetupPage.Installing:
                heading.Text = "설치하고 있어요";
                description.Text = "잠시만 기다려 주세요.\n설치 중에는 창을 닫지 마세요.";
                install.Content = "설치 중…";
                break;
            case SetupPage.Finish:
                heading.Text = "설치 완료";
                description.Text = "준비가 끝났어요.\nMicrosoft 계정을 연결하고 시작하세요.";
                status.Text = "첫 실행에서 모드팩을 준비할 수 있습니다.";
                install.Content = "클라이언트 실행";
                ((FrameworkElement)window.FindName("FinishCloseButton")).Visibility = Visibility.Visible;
                break;
        }
        if (animate && SystemParameters.ClientAreaAnimation)
        {
            transitioning = true;
            pageContent.IsHitTestVisible = false;
            var duration = TimeSpan.FromMilliseconds(160);
            var easing = new QuadraticEase { EasingMode = EasingMode.EaseOut };
            var fade = new DoubleAnimation(0, 1, duration) { FillBehavior = FillBehavior.Stop, EasingFunction = easing };
            fade.Completed += delegate { transitioning = false; pageContent.IsHitTestVisible = true; };
            pageContent.BeginAnimation(UIElement.OpacityProperty, fade);
            ((TranslateTransform)pageContent.RenderTransform).BeginAnimation(TranslateTransform.XProperty,
                new DoubleAnimation(backwards ? -14 : 14, 0, duration) { FillBehavior = FillBehavior.Stop, EasingFunction = easing });
        }
    }

    private static BitmapImage Image(string name)
    {
        using (var input = Installer.Resource(name))
        {
            var image = new BitmapImage();
            image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.StreamSource = input; image.EndInit(); image.Freeze();
            return image;
        }
    }

    private async void InstallClicked(object sender, RoutedEventArgs e)
    {
        if (transitioning) return;
        if (flow.Page == SetupPage.Finish)
        {
            try
            {
                var start = new ProcessStartInfo(Path.Combine(location.Text, "mlkc-Client.exe")) { UseShellExecute = false, WorkingDirectory = location.Text };
                start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
                Process.Start(start);
                window.Close();
            }
            catch (Exception) { status.Text = "클라이언트를 열지 못했습니다. 시작 메뉴에서 실행해 주세요."; }
            return;
        }
        if (flow.Page != SetupPage.Location)
        {
            if (flow.Next()) RenderPage(true);
            return;
        }
        try
        {
            location.Text = Installer.ValidateDirectory(location.Text);
            flow.Start();
            RenderPage(true);
            var options = new InstallOptions { Directory = location.Text, Silent = true, Scope = allUsers.IsChecked == true ? "all" : "user" };
            int code = await Task.Run(() => Installer.Run(options, text => window.Dispatcher.Invoke(new Action(() => status.Text = text))));
            if (code != 0) throw new IOException("설치를 마치지 못했습니다. 다른 프로그램에서 클라이언트를 종료한 뒤 다시 시도해 주세요. (" + code + ")");
            flow.Page = SetupPage.Finish;
            RenderPage(true);
        }
        catch (Exception error)
        {
            flow.Page = SetupPage.Location;
            RenderPage(true, true);
            status.Foreground = new SolidColorBrush(Color.FromRgb(255, 153, 164));
            status.Text = error is ArgumentException || error is IOException || error is InvalidDataException ? error.Message : "설치 위치에 접근할 수 없습니다. 다른 폴더를 지정해 주세요.";
            install.Content = "다시 시도";
        }
    }

    internal void SavePreviews(string directory)
    {
        System.IO.Directory.CreateDirectory(directory);
        foreach (SetupPage page in Enum.GetValues(typeof(SetupPage)))
        {
            flow.Page = page;
            flow.AcceptedLicense = page != SetupPage.License;
            acceptance.IsChecked = flow.AcceptedLicense;
            RenderPage();
            var content = (FrameworkElement)window.Content;
            content.Measure(new Size(860, 552)); content.Arrange(new Rect(0, 0, 860, 552)); content.UpdateLayout();
            var image = new RenderTargetBitmap(860, 552, 96, 96, PixelFormats.Pbgra32);
            image.Render(content);
            var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(image));
            using (var output = File.Create(Path.Combine(directory, page + ".png"))) encoder.Save(output);
        }
        window.Close();
    }

    internal int Run(Application app) { return app.Run(window); }
}

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if ((args.Length == 1 || args.Length == 2) && args[0] == "--self-test")
            {
                Installer.SelfTest();
                if (args.Length == 2) new SetupWindow().SavePreviews(Path.GetFullPath(args[1]));
                return 0;
            }
            var options = InstallOptions.Parse(args);
            if (options.Silent) return Installer.Run(options, delegate { });
            return new SetupWindow().Run(new Application());
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
