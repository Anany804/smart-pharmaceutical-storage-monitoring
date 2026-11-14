# Wokwi simulation

The diagram uses official documented part types: `wokwi-esp32-devkit-v1`, `wokwi-dht22`, `wokwi-photoresistor-sensor`, `wokwi-pushbutton` and `wokwi-resistor`. Wokwi's photoresistor module already contains its LDR and 10 kΩ divider; it is powered from 3.3 V so AO stays in the ESP32's safe input range. A separate 10 kΩ resistor pulls DHT22 SDA to 3.3 V. The button connects GPIO18 to ground and is read with `INPUT_PULLUP`.

1. Build the firmware from `../firmware/` with PlatformIO.
2. Open this `wokwi/` folder in VS Code with Wokwi extension or select `wokwi.toml` in the Wokwi tooling.
3. Start the simulator and inspect its serial monitor. Use the DHT22 control panel to vary temperature/humidity. Change the photoresistor's `lux` attribute/control and press the Inspection button (or press `I` when the diagram has focus).
4. For POSTs to local Node-RED, enable the Wokwi private IoT Gateway in the supported VS Code workflow and keep `API_BASE_URL` at `http://host.wokwi.internal:1880`. The public gateway does not have inbound access to your computer.

No Wokwi run has been executed as part of this workspace build because the Wokwi CLI/VS Code simulator and private gateway are not available here. The component identifiers and pin interfaces were checked against Wokwi's current part and diagram-format docs; run Wokwi's `wokwi-cli lint` when that tool is installed.
