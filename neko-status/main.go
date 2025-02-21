package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"time"

	"neko-status/stat"

	"github.com/gorilla/websocket"

	"gopkg.in/yaml.v2"
)

var (
	Config CONF
)

func main() {
	var confpath string
	var show_version bool
	flag.StringVar(&confpath, "c", "", "config path")
	flag.IntVar(&Config.Interval, "i", 1000, "refresh time ms")
	flag.StringVar(&Config.Host, "h", "127.0.0.1", "host")
	flag.IntVar(&Config.Port, "p", 55555, "port")
	flag.StringVar(&Config.Key, "key", "", "access key")
	flag.StringVar(&Config.Sid, "s", "", "host sid")
	flag.BoolVar(&Config.Ssl, "d", false, "SSL mode")
	flag.BoolVar(&show_version, "v", false, "show version")
	flag.Parse()

	if confpath != "" {
		data, err := ioutil.ReadFile(confpath)
		if err != nil {
			log.Panic(err)
		}
		err = yaml.Unmarshal([]byte(data), &Config)
		if err != nil {
			panic(err)
		}
		// fmt.Println(Config)
	}
	if show_version {
		fmt.Println("neko-status v1.0")
		return
	}
	submitStat()
}

func submitStat() {
	// wsurl := fmt.Sprintf("ws://%s:%d/stats/agent", Config.Host, Config.Port)
	protocol := "ws"
	if Config.Ssl {
		protocol = "wss"
	}
	wsurl := url.URL{Scheme: protocol, Host: fmt.Sprintf("%s:%d", Config.Host, Config.Port), Path: "/stats/agent"}
	fmt.Println(wsurl)
	dialer := websocket.Dialer{}
	header := http.Header{}
	header.Add("key", Config.Key)
	header.Add("sid", Config.Sid)
	connect, _, err := dialer.Dial(wsurl.String(), header)
	if err != nil {
		panic(err)
	}
	defer connect.Close()

	for {
		statx, _ := stat.GetStat()
		data, _ := json.Marshal(statx)
		connect.WriteMessage(websocket.TextMessage, []byte(data))
		time.Sleep(time.Millisecond * time.Duration(Config.Interval))
	}
}
