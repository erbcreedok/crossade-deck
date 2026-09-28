// ВХОД ЧЕРЕЗ TELEGRAM — системное окно входа (ASWebAuthenticationSession), как у Swift-приложения.
// Страница входа (`server/table-client/login.ts`) кончается адресом crossade://login?key=… — окно ловит его
// само, и ответ уходит в Unity сообщением `App.LoggedIn` (пусто — окно закрыли).

#import <AuthenticationServices/AuthenticationServices.h>
#import <UIKit/UIKit.h>

extern "C" void UnitySendMessage(const char* obj, const char* method, const char* msg);

@interface CrossadeLogin : NSObject <ASWebAuthenticationPresentationContextProviding>
@property (strong) ASWebAuthenticationSession *session;
@end

@implementation CrossadeLogin
- (ASPresentationAnchor)presentationAnchorForWebAuthenticationSession:(ASWebAuthenticationSession *)session
{
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes)
        if ([scene isKindOfClass:UIWindowScene.class])
            for (UIWindow *window in ((UIWindowScene *)scene).windows)
                if (window.isKeyWindow) return window;
    return UIApplication.sharedApplication.windows.firstObject;
}
@end

static CrossadeLogin *login;

extern "C" void CrossadeLoginOpen(const char *url, const char *scheme)
{
    if (login == nil) login = [CrossadeLogin new];
    NSURL *page = [NSURL URLWithString:[NSString stringWithUTF8String:url]];
    login.session = [[ASWebAuthenticationSession alloc] initWithURL:page
                                                  callbackURLScheme:[NSString stringWithUTF8String:scheme]
                                                  completionHandler:^(NSURL *back, NSError *error) {
        UnitySendMessage("App", "LoggedIn", back != nil ? back.absoluteString.UTF8String : "");
    }];
    login.session.presentationContextProvider = login;
    login.session.prefersEphemeralWebBrowserSession = NO;
    [login.session start];
}
