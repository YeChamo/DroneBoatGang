Build in STM32CubeIDE (Debug), which copies the ELF to renode/elf/.
Run emulation from repo root:
  renode firmware/stm32cube/l072_hello/renode/run.resc
Sockets:
  USART1 (LoRa): telnet 127.0.0.1 7001
  USART4 (BLE):  telnet 127.0.0.1 7003
Debug console is the Renode analyzer for USART2.
