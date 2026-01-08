/**
 * OnlyOffice Variable Autocomplete Plugin
 * Provides autocomplete suggestions when user types ${
 */
(function (window, undefined) {

    // Plugin variables
    let variables = [];
    let isActive = false;

    window.Asc.plugin.init = function () {
        console.log('Variable Autocomplete plugin initialized');

        // Listen for messages from parent window (to receive variable list)
        window.addEventListener('message', function (event) {
            if (event.data && event.data.type === 'setVariables') {
                variables = event.data.variables || [];
                console.log('Received variables:', variables.length);
            }
        });

        // Request variables from parent
        window.parent.postMessage({ type: 'getVariables' }, '*');
    };

    // Handle input help event (when user is typing)
    window.Asc.plugin.onInputHelp = function (data) {
        console.log('Input help triggered:', data);

        // Check if user typed ${
        if (data && data.text) {
            const text = data.text;
            const dollarPos = text.lastIndexOf('${');

            if (dollarPos !== -1) {
                const afterDollar = text.substring(dollarPos + 2);

                // Filter variables based on what's typed after ${
                const filtered = variables.filter(v =>
                    v.path.toLowerCase().startsWith(afterDollar.toLowerCase())
                );

                if (filtered.length > 0) {
                    // Show suggestions
                    const suggestions = filtered.slice(0, 10).map(v => ({
                        id: v.path,
                        text: '${' + v.path + '}',
                        description: v.type + (v.sample ? ': ' + v.sample.substring(0, 30) : '')
                    }));

                    window.Asc.plugin.showInputHelper(suggestions);
                }
            }
        }
    };

    // Handle suggestion selection
    window.Asc.plugin.inputHelper_onSelectItem = function (item) {
        if (item) {
            // Insert the selected variable
            window.Asc.plugin.executeMethod('PasteText', [item.text]);
        }
    };

    window.Asc.plugin.button = function (id) {
        this.executeCommand("close", "");
    };

})(window);
