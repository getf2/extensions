// Says which of its arguments aren't SF Symbols' names this Mac has
// (tools/check.mjs builds it, on a Mac).
#import <AppKit/AppKit.h>

int main(int argc, const char **argv) {
    @autoreleasepool {
        int missing = 0;
        for (int i = 1; i < argc; i++) {
            if (![NSImage imageWithSystemSymbolName:@(argv[i]) accessibilityDescription:nil]) {
                printf("not a symbol: %s\n", argv[i]);
                missing++;
            }
        }
        return missing ? 1 : 0;
    }
}
