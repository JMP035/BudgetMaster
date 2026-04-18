const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withSmsListener(config) {
    return withAndroidManifest(config, async (config) => {
        const androidManifest = config.modResults.manifest;

        // Add permissions
        if (!androidManifest['uses-permission']) {
            androidManifest['uses-permission'] = [];
        }

        const hasReadSms = androidManifest['uses-permission'].some(
            (perm) => perm.$['android:name'] === 'android.permission.READ_SMS'
        );
        if (!hasReadSms) {
            androidManifest['uses-permission'].push({
                $: { 'android:name': 'android.permission.READ_SMS' },
            });
        }

        const hasReceiveSms = androidManifest['uses-permission'].some(
            (perm) => perm.$['android:name'] === 'android.permission.RECEIVE_SMS'
        );
        if (!hasReceiveSms) {
            androidManifest['uses-permission'].push({
                $: { 'android:name': 'android.permission.RECEIVE_SMS' },
            });
        }

        // Add receiver
        const application = androidManifest.application[0];
        if (!application.receiver) {
            application.receiver = [];
        }

        const hasReceiver = application.receiver.some(
            (receiver) =>
                receiver.$ && receiver.$['android:name'] ===
                'com.centaurwarchief.smslistener.SmsListener'
        );

        if (!hasReceiver) {
            application.receiver.push({
                $: {
                    'android:name': 'com.centaurwarchief.smslistener.SmsListener',
                    'android:exported': 'true',
                },
                'intent-filter': [
                    {
                        action: [
                            {
                                $: {
                                    'android:name': 'android.provider.Telephony.SMS_RECEIVED',
                                },
                            },
                        ],
                    },
                ],
            });
        }

        return config;
    });
};
